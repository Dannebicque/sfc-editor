import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { WebSocketServer, type WebSocket } from 'ws';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { docFromProject, docFromState, encodeState, readProject } from '@grafcet/collab';
import { exportNative, importNative } from '@grafcet/io';
import { atLeast, type Accounts, type Role } from './accounts';
import type { Db } from './db';

const MSG_SYNC = 0, MSG_AWARENESS = 1;
// Codes de fermeture applicatifs (4000-4999).
export const CLOSE = { unauthenticated: 4401, forbidden: 4403, notFound: 4404, rate: 4429, tooLarge: 4413, invalid: 4422, reload: 4500 } as const;

export interface CollabOptions {
  db: Db;
  accounts: Accounts;
  allowedOrigin?: string;
  now?: () => number;
  /** Délai (ms) entre une modification et son enregistrement. */
  saveDelayMs?: number;
  /** Période (ms) de revérification des droits des connexions ouvertes. */
  recheckMs?: number;
  maxProjectBytes?: number;
  /** Messages par seconde et par connexion au-delà desquels on coupe. */
  maxMessagesPerSecond?: number;
}

interface Conn { ws: WebSocket; userId: string; userName: string; cookie: string; role: Role; clientIds: Set<number>; window: number; count: number }
interface Room {
  id: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Set<Conn>;
  dirty: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

export interface Collab {
  /** À brancher sur `server.on('upgrade', …)`. Renvoie false si le chemin n'est pas celui du WebSocket. */
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
  /** Enregistre tout et ferme les connexions. */
  close(): Promise<void>;
  /** Pour les tests. */
  rooms: Map<string, Room>;
  wss: WebSocketServer;
}

const PATH_RE = /^\/ws\/projects\/([A-Za-z0-9_-]{22})$/;

export function createCollab(o: CollabOptions): Collab {
  const { db, accounts } = o;
  const now = o.now ?? Date.now;
  const saveDelay = o.saveDelayMs ?? 2000;
  const recheck = o.recheckMs ?? 15_000;
  const maxBytes = o.maxProjectBytes ?? 2_000_000;
  const maxRate = o.maxMessagesPerSecond ?? 200;
  const rooms = new Map<string, Room>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1_000_000 });

  const q = {
    project: db.prepare('SELECT snapshot, state FROM projects WHERE id = ?'),
    save: db.prepare('UPDATE projects SET name = ?, snapshot = ?, state = ?, updated_at = ? WHERE id = ?'),
  };

  function openRoom(id: string): Room | null {
    const row = q.project.get(id) as unknown as { snapshot: string; state: Uint8Array | null } | undefined;
    if (!row) return null;
    let doc: Y.Doc;
    try { doc = row.state ? docFromState(row.state) : docFromProject(importNative(row.snapshot).model); } catch { return null; }
    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState(null); // le serveur n'a pas de présence propre
    const room: Room = { id, doc, awareness, conns: new Set(), dirty: false };
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.writeUpdate(enc, update);
      const msg = encoding.toUint8Array(enc);
      for (const c of room.conns) if (c !== origin) send(c, msg);
      if (origin !== 'init') schedule(room);
    });
    awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const conn = origin as Conn | null;
      if (conn && typeof conn === 'object' && 'clientIds' in conn) {
        for (const cid of added) conn.clientIds.add(cid);
        for (const cid of removed) conn.clientIds.delete(cid);
      }
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_AWARENESS);
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]));
      const msg = encoding.toUint8Array(enc);
      for (const c of room.conns) send(c, msg);
    });
    rooms.set(id, room);
    return room;
  }

  function send(c: Conn, msg: Uint8Array): void {
    if (c.ws.readyState === 1) c.ws.send(msg, (err) => { if (err) c.ws.terminate(); });
  }

  function schedule(room: Room): void {
    room.dirty = true;
    if (room.timer) return;
    room.timer = setTimeout(() => { room.timer = undefined; flush(room); }, saveDelay);
  }

  /**
   * Valide l'état courant (projet relu → format natif → relu) avant de l'enregistrer. Un état invalide ou trop gros n'écrase jamais
   * le dernier instantané valide : on coupe alors les connexions, qui se resynchronisent depuis l'état enregistré.
   */
  function flush(room: Room): boolean {
    if (!room.dirty) return true;
    clearTimeout(room.timer); room.timer = undefined;
    let ok = false;
    try {
      const project = readProject(room.doc);
      const snapshot = exportNative(project).output;
      const state = encodeState(room.doc);
      if (snapshot.length <= maxBytes && state.byteLength <= maxBytes * 2) {
        importNative(snapshot); // revalidation : schéma + règles structurelles
        q.save.run(project.name || 'GRAFCET', snapshot, state, now(), room.id);
        ok = true;
      }
    } catch { ok = false; }
    room.dirty = false;
    if (!ok) discard(room, CLOSE.invalid);
    return ok;
  }

  function discard(room: Room, code: number): void {
    clearTimeout(room.timer);
    rooms.delete(room.id);
    for (const c of room.conns) c.ws.close(code, 'reload');
    room.conns.clear();
    room.awareness.destroy();
    room.doc.destroy();
  }

  /**
   * Présence : un client ne peut parler que pour ses propres identifiants (pas d'usurpation d'un autre curseur), et l'identité affichée
   * (`user`) est imposée par le serveur, jamais celle que le client déclare.
   */
  function sanitizeAwareness(room: Room, c: Conn, update: Uint8Array): Uint8Array | null {
    const dec = decoding.createDecoder(update);
    const n = decoding.readVarUint(dec);
    if (n > 8) return null;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, n);
    for (let i = 0; i < n; i++) {
      const clientId = decoding.readVarUint(dec), clock = decoding.readVarUint(dec), raw = decoding.readVarString(dec);
      if (raw.length > 2048) return null;
      if (room.awareness.getStates().has(clientId) && !c.clientIds.has(clientId)) return null;
      let state: unknown = null;
      try { state = JSON.parse(raw); } catch { return null; }
      if (state !== null) {
        if (typeof state !== 'object' || Array.isArray(state)) return null;
        (state as Record<string, unknown>).user = { id: c.userId, name: c.userName, role: c.role };
      }
      encoding.writeVarUint(enc, clientId);
      encoding.writeVarUint(enc, clock);
      encoding.writeVarString(enc, JSON.stringify(state));
    }
    return encoding.toUint8Array(enc);
  }

  function onMessage(room: Room, c: Conn, data: Uint8Array): void {
    const t = Math.floor(now() / 1000);
    if (c.window !== t) { c.window = t; c.count = 0; }
    if (++c.count > maxRate) { c.ws.close(CLOSE.rate, 'rate'); return; }
    try {
      const dec = decoding.createDecoder(data);
      const type = decoding.readVarUint(dec);
      if (type === MSG_SYNC) {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_SYNC);
        const sub = decoding.peekVarUint(dec);
        // sub : 0 = demande d'état (autorisée à tous), 1 = réponse d'état, 2 = mise à jour (réservées aux éditeurs).
        if (sub !== 0 && !atLeast(c.role, 'editor')) return;
        syncProtocol.readSyncMessage(dec, enc, room.doc, c);
        if (encoding.length(enc) > 1) send(c, encoding.toUint8Array(enc));
      } else if (type === MSG_AWARENESS) {
        const clean = sanitizeAwareness(room, c, decoding.readVarUint8Array(dec));
        if (clean) awarenessProtocol.applyAwarenessUpdate(room.awareness, clean, c);
      }
    } catch { c.ws.close(CLOSE.invalid, 'protocol'); }
  }

  function connect(ws: WebSocket, projectId: string, userId: string, userName: string, cookie: string, role: Role): void {
    const room = rooms.get(projectId) ?? openRoom(projectId);
    if (!room) { ws.close(CLOSE.notFound, 'not_found'); return; }
    ws.binaryType = 'nodebuffer';
    const c: Conn = { ws, userId, userName, cookie, role, clientIds: new Set(), window: 0, count: 0 };
    room.conns.add(c);
    ws.on('message', (d: Buffer) => onMessage(room, c, new Uint8Array(d.buffer, d.byteOffset, d.byteLength)));
    const timer = setInterval(() => {
      const user = accounts.userOf(new Request('http://x/', { headers: { cookie: c.cookie } }));
      const now_ = user ? accounts.roleOf(projectId, user.id) : null;
      if (!user) ws.close(CLOSE.unauthenticated, 'session');
      else if (!now_) ws.close(CLOSE.forbidden, 'revoked');
      else c.role = now_;
    }, recheck);
    timer.unref();
    ws.on('close', () => {
      clearInterval(timer);
      room.conns.delete(c);
      awarenessProtocol.removeAwarenessStates(room.awareness, [...c.clientIds], null);
      if (room.conns.size === 0 && rooms.get(projectId) === room) {
        flush(room);
        if (rooms.get(projectId) === room) { rooms.delete(projectId); clearTimeout(room.timer); room.awareness.destroy(); room.doc.destroy(); }
      }
    });
    ws.on('error', () => ws.terminate());

    // Annonce le rôle (message applicatif hors protocole Yjs : le client sait s'il est en lecture seule), puis l'état initial.
    send(c, new Uint8Array([2, c.role === 'viewer' ? 0 : 1]));
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, room.doc);
    send(c, encoding.toUint8Array(enc));
    const states = room.awareness.getStates();
    if (states.size > 0) {
      const e2 = encoding.createEncoder();
      encoding.writeVarUint(e2, MSG_AWARENESS);
      encoding.writeVarUint8Array(e2, awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()]));
      send(c, encoding.toUint8Array(e2));
    }
  }

  const refuse = (socket: Duplex, status: number, text: string): void => {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  };

  return {
    rooms, wss,
    upgrade(req, socket, head) {
      const url = new URL(req.url ?? '/', 'http://x');
      const m = PATH_RE.exec(url.pathname);
      if (!m) return false;
      // Origin : navigateur seulement depuis l'éditeur (ou ce serveur). Sans Origin (client non navigateur), le cookie reste exigé.
      const origin = req.headers.origin;
      if (origin) {
        let ok = o.allowedOrigin === origin;
        if (!ok) { try { ok = new URL(origin).host === req.headers.host; } catch { ok = false; } }
        if (!ok) { refuse(socket, 403, 'Forbidden'); return true; }
      }
      const cookie = String(req.headers.cookie ?? '');
      const user = accounts.userOf(new Request('http://x/', { headers: { cookie } }));
      if (!user) { refuse(socket, 401, 'Unauthorized'); return true; }
      const role = accounts.roleOf(m[1]!, user.id);
      if (!role) { refuse(socket, 404, 'Not Found'); return true; }
      wss.handleUpgrade(req, socket, head, (ws) => connect(ws, m[1]!, user.id, user.name, cookie, role));
      return true;
    },
    async close() {
      for (const room of [...rooms.values()]) { flush(room); discard(room, 1001); }
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
    },
  };
}
