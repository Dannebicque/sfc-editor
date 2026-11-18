import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

const MSG_SYNC = 0, MSG_AWARENESS = 1, MSG_ROLE = 2;
/** Codes de fermeture du serveur (voir apps/server/src/collab.ts). */
export const CLOSE = { unauthenticated: 4401, forbidden: 4403, notFound: 4404, rate: 4429, tooLarge: 4413, invalid: 4422, reload: 4500 } as const;

export type LinkStatus = 'connecting' | 'synced' | 'offline';
export type EndReason = 'denied' | 'not_found' | 'reload';

export interface ProviderEvents {
  status?(s: LinkStatus): void;
  role?(r: 'viewer' | 'editor'): void;
  /** Première synchronisation terminée (et chaque reconnexion). */
  synced?(): void;
  /** Connexion terminée pour de bon : droit retiré, projet supprimé ou état à recharger (l'hôte doit rouvrir une nouvelle session). */
  ended?(why: EndReason): void;
}

type WS = typeof WebSocket;

/**
 * Client du protocole de co-édition (ADR 0005) : synchronisation Yjs + présence, reconnexion automatique avec attente croissante.
 * Hors ligne, les modifications restent dans le document local et sont envoyées à la reconnexion.
 */
export class CollabProvider {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  role: 'viewer' | 'editor' | null = null;
  status: LinkStatus = 'connecting';
  private ws: WebSocket | null = null;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dead = false;
  private readonly onDoc = (u: Uint8Array, origin: unknown): void => {
    if (origin === this || this.role === 'viewer') return;
    this.send(this.msg(MSG_SYNC, (e) => syncProtocol.writeUpdate(e, u)));
  };
  private readonly onAwareness = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown): void => {
    if (origin === this) return;
    this.send(this.msg(MSG_AWARENESS, (e) => encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed]))));
  };

  constructor(private url: string, private ev: ProviderEvents = {}, private WS: WS = WebSocket) {
    this.doc.on('update', this.onDoc);
    this.awareness.on('update', this.onAwareness);
    this.open();
  }

  private msg(type: number, fill: (e: encoding.Encoder) => void): Uint8Array {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, type);
    fill(e);
    return encoding.toUint8Array(e);
  }
  private send(m: Uint8Array): void { if (this.ws && this.ws.readyState === 1) this.ws.send(m as BufferSource); }
  private setStatus(s: LinkStatus): void { if (s !== this.status) { this.status = s; this.ev.status?.(s); } }

  private open(): void {
    if (this.dead) return;
    this.setStatus('connecting');
    const ws = new this.WS(this.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.send(this.msg(MSG_SYNC, (e) => syncProtocol.writeSyncStep1(e, this.doc)));
      if (this.awareness.getLocalState() !== null) {
        this.send(this.msg(MSG_AWARENESS, (e) => encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]))));
      }
    };
    ws.onmessage = (ev) => {
      try { this.onMessage(new Uint8Array(ev.data as ArrayBuffer)); } catch { ws.close(); }
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
      awarenessProtocol.removeAwarenessStates(this.awareness, others, this);
      const why: EndReason | null = ev.code === CLOSE.unauthenticated || ev.code === CLOSE.forbidden ? 'denied' : ev.code === CLOSE.notFound ? 'not_found' : ev.code === CLOSE.invalid || ev.code === CLOSE.reload ? 'reload' : null;
      if (why) { this.setStatus('offline'); this.ev.ended?.(why); this.destroy(); return; }
      this.setStatus('offline');
      this.retry++;
      this.timer = setTimeout(() => this.open(), Math.min(30_000, 500 * 2 ** Math.min(this.retry, 6)) * (0.75 + Math.random() * 0.5));
    };
    ws.onerror = () => { /* la fermeture qui suit déclenche la reconnexion */ };
  }

  private onMessage(data: Uint8Array): void {
    const dec = decoding.createDecoder(data);
    const type = decoding.readVarUint(dec);
    if (type === MSG_ROLE) {
      this.role = decoding.readUint8(dec) === 0 ? 'viewer' : 'editor';
      this.ev.role?.(this.role);
    } else if (type === MSG_SYNC) {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      const sub = syncProtocol.readSyncMessage(dec, enc, this.doc, this);
      if (encoding.length(enc) > 1) this.send(encoding.toUint8Array(enc));
      if (sub === syncProtocol.messageYjsSyncStep2) { this.retry = 0; this.setStatus('synced'); this.ev.synced?.(); }
    } else if (type === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(dec), this);
    }
  }

  destroy(): void {
    this.dead = true;
    clearTimeout(this.timer);
    this.doc.off('update', this.onDoc);
    this.awareness.off('update', this.onAwareness);
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'destroy');
    const ws = this.ws; this.ws = null;
    if (ws) { ws.onclose = null; ws.close(); }
    this.awareness.destroy();
  }
}
