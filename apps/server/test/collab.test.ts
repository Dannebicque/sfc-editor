import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { readProject, writeProject } from '@grafcet/collab';
import { exportNative } from '@grafcet/io';
import { demoProject } from '../../../packages/grafcet-core/test/helpers';
import { createAccounts, type Accounts } from '../src/accounts';
import { createApp } from '../src/app';
import { createCollab, type Collab } from '../src/collab';
import { openDb, type Db } from '../src/db';
import { MemoryMailer } from '../src/mailer';
import { buildServer } from '../src/server';
import { FileStore } from '../src/store';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PW = 'correct horse battery';
let db: Db, mailer: MemoryMailer, acc: Accounts, collab: Collab, server: Server, base: string;

beforeEach(async () => {
  db = openDb(':memory:');
  mailer = new MemoryMailer();
  acc = createAccounts({ db, mailer, publicUrl: 'http://localhost', scryptCost: { N: 1024, r: 8, p: 1 } });
  collab = createCollab({ db, accounts: acc, saveDelayMs: 30, recheckMs: 50 });
  const shares = createApp({ store: new FileStore(mkdtempSync(join(tmpdir(), 'collab-'))) });
  server = buildServer({ shares, accounts: acc.handler, collab });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { await collab.close(); server.closeAllConnections(); await new Promise((r) => server.close(r)); db.close(); });

const api = (path: string, cookie: string, body?: unknown, method?: string) => fetch(`http://${base}${path}`, {
  method: method ?? (body !== undefined ? 'POST' : 'GET'),
  headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
  body: body !== undefined ? JSON.stringify(body) : undefined,
});

async function signup(email: string, name: string): Promise<string> {
  await fetch(`http://${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, name, password: PW }) });
  const token = /#\/verify\/(\S+)/.exec(mailer.last(email)!.text)![1];
  await fetch(`http://${base}/api/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  const r = await fetch(`http://${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW }) });
  return r.headers.getSetCookie()[0]!.split(';')[0]!;
}

/** Client de test : mêmes protocoles que le futur client de l'éditeur. */
class Client {
  doc = new Y.Doc();
  awareness = new awarenessProtocol.Awareness(this.doc);
  role: 'viewer' | 'editor' | null = null;
  synced = false;
  closed: Promise<number>;
  ws: WebSocket;
  constructor(project: string, cookie: string, origin?: string) {
    this.ws = new WebSocket(`ws://${base}/ws/projects/${project}`, { headers: { cookie, ...(origin ? { origin } : {}) } });
    this.closed = new Promise((r) => this.ws.on('close', (code) => r(code)));
    this.ws.on('message', (d: Buffer) => {
      const dec = decoding.createDecoder(new Uint8Array(d));
      const t = decoding.readVarUint(dec);
      if (t === 2) { this.role = decoding.readUint8(dec) === 0 ? 'viewer' : 'editor'; return; }
      if (t === 0) {
        const enc = encoding.createEncoder(); encoding.writeVarUint(enc, 0);
        const sub = syncProtocol.readSyncMessage(dec, enc, this.doc, this);
        if (sub === 1) this.synced = true;
        if (encoding.length(enc) > 1) this.ws.send(encoding.toUint8Array(enc));
      } else if (t === 1) awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(dec), this);
    });
    this.ws.on('open', () => {
      const enc = encoding.createEncoder(); encoding.writeVarUint(enc, 0); syncProtocol.writeSyncStep1(enc, this.doc);
      this.ws.send(encoding.toUint8Array(enc));
    });
    this.doc.on('update', (u: Uint8Array, origin: unknown) => {
      if (origin === this || this.ws.readyState !== 1) return;
      const enc = encoding.createEncoder(); encoding.writeVarUint(enc, 0); syncProtocol.writeUpdate(enc, u);
      this.ws.send(encoding.toUint8Array(enc));
    });
    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === this || this.ws.readyState !== 1) return;
      const enc = encoding.createEncoder(); encoding.writeVarUint(enc, 1);
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed]));
      this.ws.send(encoding.toUint8Array(enc));
    });
  }
  ready = async () => { await until(() => this.synced && this.role !== null); return this; };
  close = () => this.ws.close();
}
const until = async (cond: () => boolean, ms = 3000): Promise<void> => {
  const t = Date.now();
  while (!cond()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await new Promise((r) => setTimeout(r, 10)); }
};

async function setup(): Promise<{ a: string; b: string; id: string }> {
  const a = await signup('a@ex.fr', 'Alice'), b = await signup('b@ex.fr', 'Bob');
  const id = ((await (await api('/api/projects', a, JSON.parse(exportNative(demoProject()).output))).json()) as { id: string }).id;
  return { a, b, id };
}
async function invite(owner: string, guest: string, id: string, email: string, role: 'editor' | 'viewer'): Promise<void> {
  await api(`/api/projects/${id}/invites`, owner, { email, role });
  const inv = ((await (await api('/api/me', guest)).json()) as { invitations: Array<{ id: string }> }).invitations[0]!;
  await api(`/api/invitations/${inv.id}`, guest, {}, 'POST');
}

describe('co-édition par WebSocket', () => {
  it('synchronise l\'état initial et les modifications entre deux éditeurs', async () => {
    const { a, b, id } = await setup();
    await invite(a, b, id, 'b@ex.fr', 'editor');
    const ca = await new Client(id, a).ready(), cb = await new Client(id, b).ready();
    expect(ca.role).toBe('editor');
    expect(readProject(cb.doc).name).toBe(demoProject().name);
    const p = readProject(ca.doc); p.grafcets[0]!.name = 'renommé par Alice';
    writeProject(ca.doc, p);
    await until(() => readProject(cb.doc).grafcets[0]!.name === 'renommé par Alice');
    ca.close(); cb.close();
  });

  it('enregistre l\'état et l\'instantané, relisibles en REST après fermeture', async () => {
    const { a, id } = await setup();
    const ca = await new Client(id, a).ready();
    const p = readProject(ca.doc); p.name = 'Nouveau nom';
    writeProject(ca.doc, p);
    await until(() => (db.prepare('SELECT name FROM projects WHERE id = ?').get(id) as { name: string }).name === 'Nouveau nom');
    ca.close();
    await until(() => collab.rooms.size === 0);
    expect(await (await api(`/api/projects/${id}`, a)).text()).toContain('Nouveau nom');
    // Réouverture : repart de l'état enregistré.
    const again = await new Client(id, a).ready();
    expect(readProject(again.doc).name).toBe('Nouveau nom');
    again.close();
  });

  it('un lecteur reçoit les changements mais ses propres écritures sont ignorées', async () => {
    const { a, b, id } = await setup();
    await invite(a, b, id, 'b@ex.fr', 'viewer');
    const ca = await new Client(id, a).ready(), cb = await new Client(id, b).ready();
    expect(cb.role).toBe('viewer');
    // Le lecteur écrit sur une clé que personne d'autre ne touche : si le serveur l'acceptait, elle apparaîtrait chez Alice et en base.
    cb.doc.getMap<string>('meta').set('intrus', 'tentative du lecteur');
    const pa = readProject(ca.doc); pa.name = 'vrai nom';
    writeProject(ca.doc, pa);
    await until(() => readProject(cb.doc).name === 'vrai nom');
    await new Promise((r) => setTimeout(r, 150));
    expect(ca.doc.getMap('meta').get('intrus')).toBeUndefined();
    expect(Buffer.from((db.prepare('SELECT state FROM projects WHERE id = ?').get(id) as { state: Uint8Array }).state).includes('tentative du lecteur')).toBe(false);
    ca.close(); cb.close();
  });

  it('refuse sans session, sans droit sur le projet, et depuis une autre origine', async () => {
    const { a, b, id } = await setup();
    const status = (c: Client) => new Promise<number>((r) => { c.ws.on('unexpected-response', (_q, res) => r(res.statusCode ?? 0)); c.ws.on('error', () => undefined); });
    expect(await status(new Client(id, ''))).toBe(401);
    expect(await status(new Client(id, b))).toBe(404);
    expect(await status(new Client(id, a, 'https://evil.example'))).toBe(403);
  });

  it('coupe la connexion quand le droit est retiré, et rétrograde un éditeur devenu lecteur', async () => {
    const { a, b, id } = await setup();
    await invite(a, b, id, 'b@ex.fr', 'editor');
    const cb = await new Client(id, b).ready();
    const members = ((await (await api(`/api/projects/${id}/members`, a)).json()) as { members: Array<{ userId: string; role: string }> }).members;
    const bob = members.find((m) => m.role === 'editor')!;
    await api(`/api/projects/${id}/members/${bob.userId}`, a, { role: 'viewer' }, 'PUT');
    const pb = readProject(cb.doc); pb.name = 'écriture après rétrogradation';
    await new Promise((r) => setTimeout(r, 150));
    writeProject(cb.doc, pb);
    await new Promise((r) => setTimeout(r, 150));
    expect((db.prepare('SELECT name FROM projects WHERE id = ?').get(id) as { name: string }).name).not.toBe('écriture après rétrogradation');
    await api(`/api/projects/${id}/members/${bob.userId}`, a, undefined, 'DELETE');
    expect(await cb.closed).toBe(4403);
  });

  it('un état invalide n\'écrase pas l\'instantané et force les clients à se resynchroniser', async () => {
    const { a, id } = await setup();
    const ca = await new Client(id, a).ready();
    const before = (db.prepare('SELECT snapshot FROM projects WHERE id = ?').get(id) as { snapshot: string }).snapshot;
    // Un GRAFCET cassé (séquences incohérentes) injecté par un client modifié.
    const p = readProject(ca.doc);
    const bad = JSON.parse(JSON.stringify(p.grafcets[0]!)); bad.jumps.push({ id: 'jx', from: 'inexistant', to: 'inexistant' });
    ca.doc.getMap<string>('grafcets').set(bad.id, JSON.stringify(bad));
    expect(await ca.closed).toBe(4422);
    expect((db.prepare('SELECT snapshot FROM projects WHERE id = ?').get(id) as { snapshot: string }).snapshot).toBe(before);
    const again = await new Client(id, a).ready();
    expect(readProject(again.doc).grafcets[0]!.jumps.some((j) => j.id === 'jx')).toBe(false);
    again.close();
  });

  it('diffuse la présence avec l\'identité imposée par le serveur', async () => {
    const { a, b, id } = await setup();
    await invite(a, b, id, 'b@ex.fr', 'editor');
    const ca = await new Client(id, a).ready(), cb = await new Client(id, b).ready();
    ca.awareness.setLocalState({ editing: 'g1', user: { name: 'Usurpateur' } });
    await until(() => cb.awareness.getStates().size >= 2);
    const seen = [...cb.awareness.getStates().entries()].find(([cid]) => cid === ca.doc.clientID)![1] as { editing: string; user: { name: string; role: string } };
    expect(seen.editing).toBe('g1');
    expect(seen.user.name).toBe('Alice');
    ca.close(); cb.close();
  });
});
