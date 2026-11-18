import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { exportNative, importNative } from '@grafcet/io';
import { ID_RE, type ShareStore } from './store';

export interface AppOptions {
  store: ShareStore;
  /** Horloge (ms) injectable pour les tests. */
  now?: () => number;
  /** Taille maximale d'un partage, en octets. */
  maxBytes?: number;
  /** Durée de vie d'un partage, en jours (1 à 365). */
  ttlDays?: number;
  /** Créations autorisées par heure et par adresse IP. */
  ratePerHour?: number;
  /** Origine autorisée à appeler l'API depuis un navigateur (jamais « * »). */
  allowedOrigin?: string;
}

export interface RequestContext { ip?: string }
export type Handler = (req: Request, ctx?: RequestContext) => Promise<Response>;

const b64url = (b: Buffer): string => b.toString('base64url');
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
const DAY = 86_400_000, HOUR = 3_600_000;

/** Lit le corps en s'arrêtant dès que la limite est dépassée (renvoie null). */
async function readLimited(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createApp(o: AppOptions): Handler {
  const now = o.now ?? Date.now;
  const maxBytes = o.maxBytes ?? 2_000_000;
  const ttl = Math.min(365, Math.max(1, o.ttlDays ?? 90)) * DAY;
  const rate = o.ratePerHour ?? 20;
  const hits = new Map<string, number[]>();

  /** Limitation de débit : adresses en mémoire seulement, jamais écrites. */
  const limited = (ip: string): boolean => {
    const t = now();
    const recent = (hits.get(ip) ?? []).filter((x) => t - x < HOUR);
    if (recent.length >= rate) { hits.set(ip, recent); return true; }
    recent.push(t);
    hits.set(ip, recent);
    if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((x) => t - x < HOUR)) hits.delete(k);
    return false;
  };

  return async (req, ctx = {}) => {
    const origin = req.headers.get('origin');
    const base: Record<string, string> = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
    if (o.allowedOrigin && origin === o.allowedOrigin) { base['Access-Control-Allow-Origin'] = origin; base['Vary'] = 'Origin'; }
    const send = (status: number, body?: unknown, extra: Record<string, string> = {}): Response =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { ...base, ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...extra },
      });
    const fail = (status: number, error: string): Response => send(status, { error });

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method.toUpperCase();

    if (method === 'OPTIONS' && path.startsWith('/api/')) {
      return o.allowedOrigin && origin === o.allowedOrigin
        ? send(204, undefined, { 'Access-Control-Allow-Methods': 'GET, POST, DELETE', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600' })
        : send(204);
    }
    if (path === '/api/health') return method === 'GET' ? send(200, { ok: true }) : fail(405, 'method');

    if (path === '/api/shares') {
      if (method !== 'POST') return fail(405, 'method');
      if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return fail(415, 'content_type');
      if (limited(ctx.ip ?? 'inconnu')) return fail(429, 'rate_limit');
      const text = await readLimited(req, maxBytes);
      if (text === null) return fail(413, 'too_large');
      let canonical: string;
      try { canonical = exportNative(importNative(text).model).output; } catch { return fail(400, 'invalid_document'); }
      const id = b64url(randomBytes(16));
      const token = b64url(randomBytes(24));
      const t = now();
      await o.store.put({ id, createdAt: t, expiresAt: t + ttl, tokenHash: sha256(token), document: canonical });
      return send(201, { id, deleteToken: token, expiresAt: new Date(t + ttl).toISOString() });
    }

    const m = /^\/api\/shares\/([^/]+)$/.exec(path);
    if (m) {
      const id = m[1]!;
      if (method !== 'GET' && method !== 'DELETE') return fail(405, 'method');
      if (!ID_RE.test(id)) return fail(404, 'not_found');
      const rec = await o.store.get(id);
      if (!rec || rec.expiresAt <= now()) { if (rec) await o.store.delete(id); return fail(404, 'not_found'); }
      if (method === 'GET') {
        return new Response(rec.document, { status: 200, headers: { ...base, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=60', 'X-Expires-At': new Date(rec.expiresAt).toISOString() } });
      }
      const auth = /^Bearer (\S+)$/.exec(req.headers.get('authorization') ?? '');
      const given = Buffer.from(sha256(auth?.[1] ?? ''), 'hex'), want = Buffer.from(rec.tokenHash, 'hex');
      if (!auth || given.length !== want.length || !timingSafeEqual(given, want)) return fail(403, 'forbidden');
      await o.store.delete(id);
      return send(204);
    }
    return fail(404, 'not_found');
  };
}
