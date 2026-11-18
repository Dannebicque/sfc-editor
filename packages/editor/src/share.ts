import { LS_PREFIX } from './i18n';

/** Erreurs du partage : le code sert de clé de message (`share_err_<code>`). */
export type ShareErrorCode = 'network' | 'rate_limit' | 'too_large' | 'invalid' | 'not_found' | 'forbidden' | 'server';
export class ShareError extends Error {
  constructor(public code: ShareErrorCode) { super(code); }
}

/** Partage créé par cet appareil : le jeton permet de le supprimer avant son expiration. Conservé dans le stockage local. */
export interface ShareEntry { id: string; token: string; expiresAt: string; name: string }

export const SHARES_KEY = LS_PREFIX + '-shares';
export const ID_RE = /^[A-Za-z0-9_-]{22}$/;

/** Adresse du serveur de partage (construction : `VITE_SHARE_URL`). Sans elle, le partage n'existe pas dans l'interface. */
export function shareBase(): string | null {
  const v = (import.meta.env?.VITE_SHARE_URL ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(v) ? v : null;
}

/** Lien à communiquer : l'éditeur lui-même, avec l'identifiant dans le fragment (jamais envoyé à un serveur). */
export const shareLink = (id: string, loc: { origin: string; pathname: string } = location): string => `${loc.origin}${loc.pathname}#/s/${id}`;
export const idFromHash = (hash: string): string | null => { const m = /^#\/s\/([A-Za-z0-9_-]{22})$/.exec(hash); return m ? m[1]! : null; };

type Fetch = typeof fetch;
const codeOf = (status: number): ShareErrorCode =>
  status === 404 ? 'not_found' : status === 403 ? 'forbidden' : status === 413 ? 'too_large' : status === 429 ? 'rate_limit' : status === 400 || status === 415 ? 'invalid' : 'server';

async function call(f: Fetch, url: string, init?: RequestInit): Promise<Response> {
  let r: Response;
  try { r = await f(url, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer' }); } catch { throw new ShareError('network'); }
  if (!r.ok) throw new ShareError(codeOf(r.status));
  return r;
}

/** Publie le document natif ; renvoie l'identifiant, le jeton de suppression (affiché une seule fois) et l'expiration. */
export async function createShare(base: string, text: string, f: Fetch = fetch): Promise<{ id: string; deleteToken: string; expiresAt: string }> {
  const r = await call(f, base + '/api/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text });
  const j = await r.json() as { id?: string; deleteToken?: string; expiresAt?: string };
  if (!j.id || !ID_RE.test(j.id) || !j.deleteToken || !j.expiresAt) throw new ShareError('server');
  return { id: j.id, deleteToken: j.deleteToken, expiresAt: j.expiresAt };
}

export async function fetchShare(base: string, id: string, f: Fetch = fetch): Promise<string> {
  if (!ID_RE.test(id)) throw new ShareError('not_found');
  return (await call(f, `${base}/api/shares/${id}`)).text();
}

export async function deleteShare(base: string, id: string, token: string, f: Fetch = fetch): Promise<void> {
  await call(f, `${base}/api/shares/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

export function loadEntries(): ShareEntry[] {
  try {
    const o = JSON.parse(localStorage.getItem(SHARES_KEY) ?? '[]') as unknown;
    return Array.isArray(o) ? o.filter((e): e is ShareEntry => !!e && typeof e.id === 'string' && ID_RE.test(e.id) && typeof e.token === 'string' && typeof e.expiresAt === 'string') : [];
  } catch { return []; }
}
export function saveEntries(list: ShareEntry[]): void {
  try { localStorage.setItem(SHARES_KEY, JSON.stringify(list)); } catch { /* stockage indisponible : le partage reste valable, sans suppression depuis cet appareil */ }
}
