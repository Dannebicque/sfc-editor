import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportNative } from '@grafcet/io';
import { demoProject } from '../../../packages/grafcet-core/test/helpers';
import { createApp, type Handler } from '../src/app';
import { FileStore } from '../src/store';

let dir: string, clock: number, app: Handler, store: FileStore;
const doc = () => exportNative(demoProject()).output;
const post = (body: string, ip = '1.1.1.1', type = 'application/json') => app(new Request('http://x/api/shares', { method: 'POST', headers: { 'content-type': type }, body }), { ip });
const get = (id: string) => app(new Request(`http://x/api/shares/${id}`));
const del = (id: string, token?: string) => app(new Request(`http://x/api/shares/${id}`, { method: 'DELETE', headers: token ? { authorization: `Bearer ${token}` } : {} }));
const make = (o: Partial<Parameters<typeof createApp>[0]> = {}) => createApp({ store, now: () => clock, ...o });

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'share-')); clock = 1_700_000_000_000; store = new FileStore(dir); app = make(); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('partage par lien', () => {
  it('crée un partage, le relit et renvoie le même projet en format canonique', async () => {
    const r = await post(doc());
    expect(r.status).toBe(201);
    const { id, deleteToken, expiresAt } = await r.json() as { id: string; deleteToken: string; expiresAt: string };
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(deleteToken.length).toBeGreaterThanOrEqual(32);
    expect(new Date(expiresAt).getTime()).toBe(clock + 90 * 86_400_000);
    const g = await get(id);
    expect(g.status).toBe(200);
    expect(await g.text()).toBe(doc());
  });
  it('ne conserve jamais le jeton de suppression en clair', async () => {
    const { id, deleteToken } = await (await post(doc())).json() as { id: string; deleteToken: string };
    expect(await readFile(join(dir, id + '.json'), 'utf8')).not.toContain(deleteToken);
  });
  it('refuse un document invalide, un mauvais type de contenu et une taille excessive', async () => {
    expect((await post('{"format":"autre"}')).status).toBe(400);
    expect((await post('pas du json')).status).toBe(400);
    expect((await post(doc(), '1.1.1.1', 'text/plain')).status).toBe(415);
    app = make({ maxBytes: 100 });
    expect((await post(doc())).status).toBe(413);
    expect(await readdir(dir)).toEqual([]);
  });
  it('limite le nombre de créations par adresse et par heure', async () => {
    app = make({ ratePerHour: 2 });
    expect((await post(doc())).status).toBe(201);
    expect((await post(doc())).status).toBe(201);
    expect((await post(doc())).status).toBe(429);
    expect((await post(doc(), '2.2.2.2')).status).toBe(201);
    clock += 3_600_001;
    expect((await post(doc())).status).toBe(201);
  });
  it('supprime avec le bon jeton seulement', async () => {
    const { id, deleteToken } = await (await post(doc())).json() as { id: string; deleteToken: string };
    expect((await del(id)).status).toBe(403);
    expect((await del(id, 'faux')).status).toBe(403);
    expect((await get(id)).status).toBe(200);
    expect((await del(id, deleteToken)).status).toBe(204);
    expect((await get(id)).status).toBe(404);
  });
  it('un partage échu est introuvable, puis balayé', async () => {
    const { id } = await (await post(doc())).json() as { id: string };
    clock += 91 * 86_400_000;
    expect((await get(id)).status).toBe(404);
    const again = await (await post(doc())).json() as { id: string };
    clock += 91 * 86_400_000;
    expect(await store.sweep(clock)).toBe(1);
    expect(await readdir(dir)).toEqual([]);
    expect(again.id).not.toBe(id);
  });
  it('refuse les identifiants hors format (pas de traversée de dossier)', async () => {
    expect((await get('..%2F..%2Fetc%2Fpasswd')).status).toBe(404);
    expect((await get('court')).status).toBe(404);
    expect((await del('x'.repeat(22), 'a')).status).toBe(404);
  });
  it('CORS : uniquement l\'origine configurée, jamais « * »', async () => {
    app = make({ allowedOrigin: 'https://app.example' });
    const ok = await app(new Request('http://x/api/health', { headers: { origin: 'https://app.example' } }));
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example');
    const other = await app(new Request('http://x/api/health', { headers: { origin: 'https://evil.example' } }));
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    const pre = await app(new Request('http://x/api/shares', { method: 'OPTIONS', headers: { origin: 'https://app.example' } }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
  });
  it('méthodes et chemins inconnus', async () => {
    expect((await app(new Request('http://x/api/shares', { method: 'GET' }))).status).toBe(405);
    expect((await app(new Request('http://x/autre'))).status).toBe(404);
    const h = await app(new Request('http://x/api/health'));
    expect(h.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
