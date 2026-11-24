/**
 * Client de l'API de comptes et de projets (ADR 0005). Actif seulement si l'éditeur est construit avec `VITE_ACCOUNTS=1` ;
 * `VITE_API_URL` est l'adresse du serveur (vide : même origine, ce qui est recommandé : un reverse proxy sert l'éditeur et l'API).
 */
export const accountsEnabled: boolean = import.meta.env?.VITE_ACCOUNTS === '1';
export const apiBase: string = (import.meta.env?.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(public code: string, public status = 0) { super(code); }
}

/** Codes d'erreur du serveur qui ont un message (`acc_err_<code>`) ; les autres s'affichent comme une erreur de serveur. */
export const KNOWN_ERRORS = new Set([
  'network', 'server', 'invalid_credentials', 'rate_limit', 'invalid_body', 'password_too_short', 'password_too_long', 'password_is_email', 'invalid_token',
  'unauthenticated', 'forbidden', 'not_found', 'too_large', 'invalid_document', 'too_many_projects', 'plan_required', 'email_not_verified', 'owner_cannot_leave',
  'owner_role_fixed', 'invalid_target', 'registration_closed', 'bad_origin', 'content_type', 'method',
  'class_managed', 'too_many_classes', 'too_many_assignments', 'already_active',
]);

type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
/** Pour les tests. */
export const setFetch = (f: Fetch): void => { fetcher = f; };

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetcher(apiBase + path, {
      method,
      credentials: 'include',
      referrerPolicy: 'no-referrer',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
  } catch { throw new ApiError('network'); }
  if (!r.ok) {
    let code = 'server';
    try { const j = await r.json() as { error?: string }; if (j.error) code = j.error; } catch { /* corps absent */ }
    throw new ApiError(code, r.status);
  }
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Adresse WebSocket d'un projet : même hôte que l'API (ou que la page). */
export function wsUrl(projectId: string, loc: { protocol: string; host: string } = location): string {
  const origin = apiBase || `${loc.protocol}//${loc.host}`;
  return origin.replace(/^http/, 'ws') + '/ws/projects/' + projectId;
}

export interface UserInfo { id: string; email: string; name: string; locale: string; emailVerified: boolean }
export interface ProjectSummary { id: string; name: string; role: 'owner' | 'editor' | 'viewer'; owner: string; updatedAt: string }
export interface Invitation { id: string; role: 'editor' | 'viewer'; project: string; invitedBy: string; expiresAt: string }
export interface ClassInvitation { id: string; class: string; invitedBy: string; expiresAt: string }
export interface ClassSummary { id: string; name: string; students?: number; assignments?: number; teacher?: string }
export interface ClassStudent { userId: string; name: string; email: string; activated: boolean }
export interface AssignmentSummary { id: string; title: string; instructions: string; dueAt: string | null; createdAt: string; students?: number; submitted?: number;
  submission?: { projectId: string; status: 'todo' | 'submitted'; submittedAt: string | null; comments: number } | null }
export interface ClassDetail { role: 'teacher' | 'student'; id: string; name: string; teacher?: string; students?: ClassStudent[]; invites?: Array<{ id: string; email: string; expiresAt: string }>; assignments: AssignmentSummary[] }
export interface Submission { userId: string; name: string; projectId: string; status: 'todo' | 'submitted'; submittedAt: string | null; updatedAt: string; access: 'viewer' | 'editor' | null; comments: number }
export interface ClassComment { id: string; body: string; author: string; createdAt: string }
export interface AssignmentDetail { assignment: AssignmentSummary; submissions?: Submission[]; submission?: { projectId: string; status: 'todo' | 'submitted'; submittedAt: string | null } | null; comments?: ClassComment[] }
export interface ImportResult { email: string; status: string }
export interface Member { userId: string; role: 'owner' | 'editor' | 'viewer'; name: string; email?: string }
export interface PendingInvite { id: string; email: string; role: 'editor' | 'viewer'; expiresAt: string }

/** Routes de l'interface portées par le fragment d'adresse (jamais envoyé au serveur). */
export type HashRoute =
  | { kind: 'verify'; token: string } | { kind: 'reset'; token: string } | { kind: 'forgot' } | { kind: 'register' }
  | { kind: 'invitations' } | { kind: 'project'; id: string };
export function parseHash(hash: string): HashRoute | null {
  let m: RegExpExecArray | null;
  if ((m = /^#\/verify\/([A-Za-z0-9_-]{10,100})$/.exec(hash))) return { kind: 'verify', token: m[1]! };
  if ((m = /^#\/reset\/([A-Za-z0-9_-]{10,100})$/.exec(hash))) return { kind: 'reset', token: m[1]! };
  if (hash === '#/forgot') return { kind: 'forgot' };
  if (hash === '#/register') return { kind: 'register' };
  if (hash === '#/invitations') return { kind: 'invitations' };
  if ((m = /^#\/p\/([A-Za-z0-9_-]{22})$/.exec(hash))) return { kind: 'project', id: m[1]! };
  return null;
}
