import { createHash, randomBytes } from 'node:crypto';
import { exportNative, importNative } from '@grafcet/io';
import { z } from 'zod';
import { tx, type Db } from './db';
import { compose, type Mailer } from './mailer';
import { DEFAULT_COST, hashPassword, passwordProblem, verifyPassword, type ScryptCost } from './password';

export type Role = 'owner' | 'editor' | 'viewer';
const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };
export const atLeast = (r: Role | null | undefined, min: Role): boolean => !!r && RANK[r] >= RANK[min];

export interface AccountsOptions {
  db: Db;
  mailer: Mailer;
  /** URL publique de l'éditeur (sert aux liens des mails). */
  publicUrl: string;
  /** Origine autorisée à appeler l'API depuis un navigateur ; sinon seule l'origine du serveur est acceptée. */
  allowedOrigin?: string;
  /** Cookies `Secure` + préfixe `__Host-` (obligatoire derrière HTTPS, donc en production). */
  secureCookies?: boolean;
  now?: () => number;
  scryptCost?: ScryptCost;
  maxProjectBytes?: number;
  maxProjectsPerUser?: number;
  /** Inscriptions ouvertes ? (fermées : seules les personnes invitées peuvent créer un compte.) */
  allowRegistration?: boolean;
}

export interface Ctx { ip?: string }
export type Handler = (req: Request, ctx?: Ctx) => Promise<Response>;

export interface User { id: string; email: string; name: string; locale: string; emailVerified: boolean }
interface UserRow { id: string; email: string; name: string; pw_hash: string; locale: string; email_verified_at: number | null }

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
const rid = (n = 16): string => randomBytes(n).toString('base64url');
const DAY = 86_400_000, HOUR = 3_600_000, MIN = 60_000;
const SESSION_SLIDE = 30 * DAY, SESSION_MAX = 90 * DAY;
const ID_RE = /^[A-Za-z0-9_-]{22}$/;
const normEmail = (e: string): string => e.trim().toLowerCase();

const email = z.string().trim().max(254).transform((s) => s.toLowerCase()).pipe(z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/));
const name = z.string().trim().min(1).max(80).refine((s) => !/[\p{Cc}]/u.test(s));
const locale = z.enum(['fr', 'en']);
const role = z.enum(['editor', 'viewer']);
const S = {
  register: z.object({ email, name, password: z.string(), locale: locale.optional() }),
  login: z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().max(1000) }),
  token: z.object({ token: z.string().min(10).max(100) }),
  forgot: z.object({ email: z.string().trim().toLowerCase().max(254) }),
  reset: z.object({ token: z.string().min(10).max(100), password: z.string() }),
  patchMe: z.object({ name: name.optional(), locale: locale.optional() }).refine((o) => o.name !== undefined || o.locale !== undefined),
  password: z.object({ current: z.string().max(1000), next: z.string() }),
  deleteMe: z.object({ password: z.string().max(1000) }),
  invite: z.object({ email, role }),
  setRole: z.object({ role }),
  transfer: z.object({ userId: z.string() }),
};

/** Compteurs glissants en mémoire (rien n'est écrit : ni adresses IP ni emails). */
class Limiter {
  private hits = new Map<string, number[]>();
  constructor(private now: () => number) {}
  /** Renvoie true si la limite est atteinte ; sinon enregistre l'essai. */
  hit(key: string, max: number, windowMs: number): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= max) { this.hits.set(key, recent); return true; }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 20_000) for (const [k, v] of this.hits) if (!v.some((x) => t - x < windowMs)) this.hits.delete(k);
    return false;
  }
  reset(key: string): void { this.hits.delete(key); }
}

async function readJson(req: Request, max: number): Promise<unknown | typeof BAD> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return BAD;
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return TOO_BIG;
  if (!req.body) return BAD;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); return TOO_BIG; }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return BAD; }
}
const BAD = Symbol('bad'), TOO_BIG = Symbol('too_big');

export interface Accounts {
  handler: Handler;
  /** Utilisateur d'une requête (cookie de session), pour le WebSocket. */
  userOf(req: Request): User | null;
  /** Rôle d'un utilisateur sur un projet. */
  roleOf(projectId: string, userId: string): Role | null;
  cookieName: string;
}

export function createAccounts(o: AccountsOptions): Accounts {
  const { db, mailer } = o;
  const now = o.now ?? Date.now;
  const cost = o.scryptCost ?? DEFAULT_COST;
  const maxProject = o.maxProjectBytes ?? 2_000_000;
  const maxProjects = o.maxProjectsPerUser ?? 200;
  const cookieName = o.secureCookies ? '__Host-sid' : 'sid';
  const limiter = new Limiter(now);
  const base = o.publicUrl.replace(/\/+$/, '');
  let dummyHash: Promise<string> | null = null;

  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    insUser: db.prepare('INSERT INTO users (id,email,name,pw_hash,locale,created_at) VALUES (?,?,?,?,?,?)'),
    insSession: db.prepare('INSERT INTO sessions (id_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)'),
    session: db.prepare('SELECT s.*, u.id AS uid FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?'),
    slide: db.prepare('UPDATE sessions SET expires_at = ? WHERE id_hash = ?'),
    delSession: db.prepare('DELETE FROM sessions WHERE id_hash = ?'),
    delSessionsOf: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    delOtherSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash <> ?'),
    insToken: db.prepare('INSERT INTO tokens (hash,user_id,kind,expires_at) VALUES (?,?,?,?)'),
    delTokensOf: db.prepare('DELETE FROM tokens WHERE user_id = ? AND kind = ?'),
    takeToken: db.prepare('DELETE FROM tokens WHERE hash = ? AND kind = ? AND expires_at > ? RETURNING user_id'),
    project: db.prepare('SELECT * FROM projects WHERE id = ?'),
    role: db.prepare('SELECT role FROM members WHERE project_id = ? AND user_id = ?'),
    myProjects: db.prepare(`SELECT p.id, p.name, p.updated_at, m.role, u.name AS owner_name FROM members m
      JOIN projects p ON p.id = m.project_id JOIN users u ON u.id = p.owner_id WHERE m.user_id = ? ORDER BY p.updated_at DESC`),
    countOwned: db.prepare('SELECT COUNT(*) AS n FROM projects WHERE owner_id = ?'),
    insProject: db.prepare('INSERT INTO projects (id,owner_id,name,created_at,updated_at,snapshot) VALUES (?,?,?,?,?,?)'),
    insMember: db.prepare('INSERT INTO members (project_id,user_id,role,created_at) VALUES (?,?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role = excluded.role'),
    delProject: db.prepare('DELETE FROM projects WHERE id = ?'),
    members: db.prepare('SELECT m.user_id, m.role, u.name, u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ? ORDER BY m.role DESC, u.name'),
    setRole: db.prepare("UPDATE members SET role = ? WHERE project_id = ? AND user_id = ? AND role <> 'owner'"),
    delMember: db.prepare("DELETE FROM members WHERE project_id = ? AND user_id = ? AND role <> 'owner'"),
    invites: db.prepare('SELECT id, email, role, created_at, expires_at FROM invites WHERE project_id = ? AND expires_at > ? ORDER BY created_at'),
    upsertInvite: db.prepare(`INSERT INTO invites (id,project_id,email,role,invited_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(project_id,email) DO UPDATE SET role = excluded.role, invited_by = excluded.invited_by, created_at = excluded.created_at, expires_at = excluded.expires_at`),
    myInvites: db.prepare(`SELECT i.id, i.role, i.created_at, i.expires_at, p.name AS project, u.name AS invited_by FROM invites i
      JOIN projects p ON p.id = i.project_id JOIN users u ON u.id = i.invited_by WHERE i.email = ? AND i.expires_at > ? ORDER BY i.created_at DESC`),
    invite: db.prepare('SELECT * FROM invites WHERE id = ?'),
    delInvite: db.prepare('DELETE FROM invites WHERE id = ?'),
    delInviteOf: db.prepare('DELETE FROM invites WHERE id = ? AND project_id = ?'),
    ownedProjects: db.prepare('SELECT id, name FROM projects WHERE owner_id = ?'),
    otherMembers: db.prepare("SELECT user_id FROM members WHERE project_id = ? AND user_id <> ? ORDER BY CASE role WHEN 'editor' THEN 0 ELSE 1 END, created_at LIMIT 1"),
    reown: db.prepare('UPDATE projects SET owner_id = ? WHERE id = ?'),
    delUser: db.prepare('DELETE FROM users WHERE id = ?'),
  };

  const toUser = (r: UserRow): User => ({ id: r.id, email: r.email, name: r.name, locale: r.locale, emailVerified: r.email_verified_at !== null });
  const getRole = (projectId: string, userId: string): Role | null => (q.role.get(projectId, userId) as { role: Role } | undefined)?.role ?? null;

  const parseCookies = (h: string | null): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const part of (h ?? '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
    return out;
  };
  const sessionToken = (req: Request): string | null => parseCookies(req.headers.get('cookie'))[cookieName] ?? null;

  function sessionOf(req: Request): { user: User; hash: string; createdAt: number } | null {
    const tok = sessionToken(req);
    if (!tok || tok.length > 100) return null;
    const hash = sha256(tok);
    const s = q.session.get(hash) as { user_id: string; created_at: number; expires_at: number } | undefined;
    const t = now();
    if (!s || s.expires_at <= t) { if (s) q.delSession.run(hash); return null; }
    const u = q.userById.get(s.user_id) as unknown as UserRow | undefined;
    if (!u) return null;
    const next = Math.min(t + SESSION_SLIDE, s.created_at + SESSION_MAX);
    if (next - s.expires_at > HOUR) { q.slide.run(next, hash); db.prepare('UPDATE users SET last_seen_at = ?, purge_warned_at = NULL WHERE id = ?').run(t, u.id); }
    return { user: toUser(u), hash, createdAt: s.created_at };
  }

  const cookie = (value: string, maxAgeS: number): string =>
    `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${o.secureCookies ? '; Secure' : ''}`;

  async function startSession(userId: string): Promise<string> {
    const tok = rid(32), t = now();
    q.insSession.run(sha256(tok), userId, t, t + SESSION_SLIDE);
    db.prepare('UPDATE users SET last_seen_at = ?, purge_warned_at = NULL WHERE id = ?').run(t, userId);
    return cookie(tok, SESSION_SLIDE / 1000);
  }

  function newToken(userId: string, kind: 'verify' | 'reset'): string {
    const tok = rid(32);
    q.delTokensOf.run(userId, kind);
    q.insToken.run(sha256(tok), userId, kind, now() + (kind === 'verify' ? 24 * HOUR : HOUR));
    return tok;
  }

  async function sendVerify(u: UserRow): Promise<void> {
    const url = `${base}/#/verify/${newToken(u.id, 'verify')}`;
    await mailer.send(compose('verify', u.locale, u.email, { name: u.name, url }));
  }

  /** Les invitations en attente pour cet email deviennent des droits seulement quand l'email est vérifié (acceptation explicite). */
  const pendingInvites = (u: User): unknown[] => (u.emailVerified ? (q.myInvites.all(u.email, now()) as Array<Record<string, unknown>>).map((i) => ({
    id: i.id, role: i.role, project: i.project, invitedBy: i.invited_by, expiresAt: new Date(i.expires_at as number).toISOString(),
  })) : []);

  const handler: Handler = async (req, ctx = {}) => {
    const origin = req.headers.get('origin');
    const method = req.method.toUpperCase();
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const headers: Record<string, string> = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
    const crossOk = !!o.allowedOrigin && origin === o.allowedOrigin;
    if (crossOk) { headers['Access-Control-Allow-Origin'] = origin!; headers['Access-Control-Allow-Credentials'] = 'true'; headers['Vary'] = 'Origin'; }
    const send = (status: number, body?: unknown, extra: Record<string, string | string[]> = {}): Response => {
      const h = new Headers({ ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }) });
      for (const [k, v] of Object.entries(extra)) for (const x of Array.isArray(v) ? v : [v]) h.append(k, x);
      return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: h });
    };
    const fail = (status: number, error: string, extra?: Record<string, string>): Response => send(status, { error }, extra);

    if (method === 'OPTIONS') {
      return crossOk ? send(204, undefined, { 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' }) : send(204);
    }
    // CSRF : une requête qui modifie doit venir de l'éditeur (Origin connu) ; sans Origin (client non navigateur), le cookie n'est de toute façon pas envoyé par un site tiers.
    if (method !== 'GET' && method !== 'HEAD' && origin) {
      let same = false;
      try { same = new URL(origin).host === url.host; } catch { /* origine invalide */ }
      if (!same && !crossOk) return fail(403, 'bad_origin');
    }

    const ip = ctx.ip ?? 'inconnu';
    const body = async (schema: z.ZodType, max = 20_000): Promise<{ ok: true; data: any } | { ok: false; res: Response }> => {
      const j = await readJson(req, max);
      if (j === TOO_BIG) return { ok: false, res: fail(413, 'too_large') };
      if (j === BAD) return { ok: false, res: fail(415, 'content_type') };
      const r = schema.safeParse(j);
      return r.success ? { ok: true, data: r.data } : { ok: false, res: fail(400, 'invalid_body') };
    };
    const session = path.startsWith('/api/') && !path.startsWith('/api/auth/') ? sessionOf(req) : null;
    const need = (): User | Response => session?.user ?? fail(401, 'unauthenticated');
    const isRes = (x: unknown): x is Response => x instanceof Response;

    // ───────────── authentification ─────────────
    if (path === '/api/auth/register' && method === 'POST') {
      if (limiter.hit('reg:' + ip, 10, HOUR)) return fail(429, 'rate_limit');
      if (o.allowRegistration === false) {
        // Inscriptions fermées : on ne crée que si une invitation attend cet email.
        const peek = await readJson(req.clone(), 20_000);
        const em = typeof peek === 'object' && peek && 'email' in peek ? normEmail(String((peek as { email: unknown }).email)) : '';
        if (!(db.prepare('SELECT 1 FROM invites WHERE email = ? AND expires_at > ?').get(em, now()))) return fail(403, 'registration_closed');
      }
      const b = await body(S.register);
      if (!b.ok) return b.res;
      const { email: em, name: nm, password, locale: loc } = b.data as { email: string; name: string; password: string; locale?: string };
      const problem = passwordProblem(password, em);
      if (problem) return fail(400, 'password_' + problem);
      if (limiter.hit('regmail:' + em, 5, HOUR)) return send(202, { ok: true });
      const existing = q.userByEmail.get(em) as unknown as UserRow | undefined;
      if (existing) {
        await mailer.send(compose('exists', existing.locale, em, { url: `${base}/#/forgot` }));
      } else {
        const id = rid(), hash = await hashPassword(password, cost);
        try { q.insUser.run(id, em, nm, hash, loc ?? 'fr', now()); } catch { return send(202, { ok: true }); }
        await sendVerify(q.userById.get(id) as unknown as UserRow);
      }
      return send(202, { ok: true });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const b = await body(S.login);
      if (!b.ok) return b.res;
      const { email: em, password } = b.data as { email: string; password: string };
      if (limiter.hit('login-ip:' + ip, 30, 15 * MIN) || limiter.hit('login:' + em, 8, 15 * MIN)) return fail(429, 'rate_limit');
      const u = q.userByEmail.get(em) as unknown as UserRow | undefined;
      // Hachage factice si le compte n'existe pas : même durée, pas d'énumération par le temps de réponse.
      const ok = u ? await verifyPassword(password, u.pw_hash) : (await verifyPassword(password, await (dummyHash ??= hashPassword('dummy-password', cost))), false);
      if (!u || !ok) return fail(401, 'invalid_credentials');
      limiter.reset('login:' + em);
      const set = await startSession(u.id);
      return send(200, { user: toUser(u) }, { 'Set-Cookie': set });
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      const tok = sessionToken(req);
      if (tok) q.delSession.run(sha256(tok));
      return send(204, undefined, { 'Set-Cookie': cookie('', 0) });
    }

    if (path === '/api/auth/verify' && method === 'POST') {
      const b = await body(S.token);
      if (!b.ok) return b.res;
      const r = q.takeToken.get(sha256(b.data.token), 'verify', now()) as { user_id: string } | undefined;
      if (!r) return fail(400, 'invalid_token');
      db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(now(), r.user_id);
      return send(204);
    }

    if (path === '/api/auth/resend' && method === 'POST') {
      const me = sessionOf(req);
      if (!me) return fail(401, 'unauthenticated');
      if (limiter.hit('resend:' + me.user.id, 3, HOUR)) return fail(429, 'rate_limit');
      if (!me.user.emailVerified) await sendVerify(q.userById.get(me.user.id) as unknown as UserRow);
      return send(202, { ok: true });
    }

    if (path === '/api/auth/forgot' && method === 'POST') {
      const b = await body(S.forgot);
      if (!b.ok) return b.res;
      const em = b.data.email as string;
      if (limiter.hit('forgot-ip:' + ip, 10, HOUR) || limiter.hit('forgot:' + em, 3, HOUR)) return send(202, { ok: true });
      const u = q.userByEmail.get(em) as unknown as UserRow | undefined;
      if (u) await mailer.send(compose('reset', u.locale, u.email, { name: u.name, url: `${base}/#/reset/${newToken(u.id, 'reset')}` }));
      return send(202, { ok: true });
    }

    if (path === '/api/auth/reset' && method === 'POST') {
      const b = await body(S.reset);
      if (!b.ok) return b.res;
      if (limiter.hit('reset-ip:' + ip, 20, HOUR)) return fail(429, 'rate_limit');
      const peek = db.prepare('SELECT u.email FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.hash = ? AND t.kind = ? AND t.expires_at > ?').get(sha256(b.data.token), 'reset', now()) as { email: string } | undefined;
      if (!peek) return fail(400, 'invalid_token');
      const problem = passwordProblem(b.data.password, peek.email);
      if (problem) return fail(400, 'password_' + problem);
      const hash = await hashPassword(b.data.password, cost);
      const done = tx(db, () => {
        const r = q.takeToken.get(sha256(b.data.token), 'reset', now()) as { user_id: string } | undefined;
        if (!r) return false;
        db.prepare('UPDATE users SET pw_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').run(hash, now(), r.user_id);
        q.delSessionsOf.run(r.user_id);
        return true;
      });
      return done ? send(204) : fail(400, 'invalid_token');
    }

    // ───────────── mon compte ─────────────
    if (path === '/api/me') {
      const u = need(); if (isRes(u)) return u;
      if (method === 'GET') return send(200, { user: u, invitations: pendingInvites(u) });
      if (method === 'PATCH') {
        const b = await body(S.patchMe); if (!b.ok) return b.res;
        db.prepare('UPDATE users SET name = COALESCE(?, name), locale = COALESCE(?, locale) WHERE id = ?').run(b.data.name ?? null, b.data.locale ?? null, u.id);
        return send(200, { user: toUser(q.userById.get(u.id) as unknown as UserRow) });
      }
      if (method === 'DELETE') {
        const b = await body(S.deleteMe); if (!b.ok) return b.res;
        const row = q.userById.get(u.id) as unknown as UserRow;
        if (limiter.hit('del:' + u.id, 5, HOUR)) return fail(429, 'rate_limit');
        if (!(await verifyPassword(b.data.password, row.pw_hash))) return fail(403, 'invalid_credentials');
        eraseUser(db, u.id, now());
        return send(204, undefined, { 'Set-Cookie': cookie('', 0) });
      }
      return fail(405, 'method');
    }

    if (path === '/api/me/password' && method === 'POST') {
      const u = need(); if (isRes(u)) return u;
      const b = await body(S.password); if (!b.ok) return b.res;
      if (limiter.hit('pw:' + u.id, 10, 15 * MIN)) return fail(429, 'rate_limit');
      const row = q.userById.get(u.id) as unknown as UserRow;
      if (!(await verifyPassword(b.data.current, row.pw_hash))) return fail(403, 'invalid_credentials');
      const problem = passwordProblem(b.data.next, row.email);
      if (problem) return fail(400, 'password_' + problem);
      db.prepare('UPDATE users SET pw_hash = ? WHERE id = ?').run(await hashPassword(b.data.next, cost), u.id);
      q.delOtherSessions.run(u.id, session!.hash);
      return send(204);
    }

    if (path === '/api/me/export' && method === 'GET') {
      const u = need(); if (isRes(u)) return u;
      const projects = (q.myProjects.all(u.id) as Array<{ id: string; role: string }>).map((m) => {
        const p = q.project.get(m.id) as { name: string; snapshot: string; created_at: number; updated_at: number };
        return { id: m.id, role: m.role, name: p.name, createdAt: new Date(p.created_at).toISOString(), updatedAt: new Date(p.updated_at).toISOString(), document: m.role === 'owner' ? JSON.parse(p.snapshot) : undefined };
      });
      return send(200, { exportedAt: new Date(now()).toISOString(), user: u, projects }, { 'Content-Disposition': 'attachment; filename="mes-donnees.json"' });
    }

    let m: RegExpExecArray | null;
    if ((m = /^\/api\/invitations\/([^/]+)$/.exec(path))) {
      const u = need(); if (isRes(u)) return u;
      const id = m[1]!;
      const inv = q.invite.get(id) as { id: string; project_id: string; email: string; role: Role; expires_at: number } | undefined;
      if (!inv || inv.email !== u.email || inv.expires_at <= now()) return fail(404, 'not_found');
      if (method === 'DELETE') { q.delInvite.run(id); return send(204); }
      if (method !== 'POST') return fail(405, 'method');
      if (!u.emailVerified) return fail(403, 'email_not_verified');
      tx(db, () => {
        if (getRole(inv.project_id, u.id) !== 'owner') q.insMember.run(inv.project_id, u.id, inv.role, now());
        q.delInvite.run(id);
      });
      return send(200, { projectId: inv.project_id, role: inv.role });
    }

    // ───────────── projets ─────────────
    if (path === '/api/projects') {
      const u = need(); if (isRes(u)) return u;
      if (method === 'GET') {
        const rows = q.myProjects.all(u.id) as Array<{ id: string; name: string; updated_at: number; role: Role; owner_name: string }>;
        return send(200, { projects: rows.map((r) => ({ id: r.id, name: r.name, role: r.role, owner: r.owner_name, updatedAt: new Date(r.updated_at).toISOString() })) });
      }
      if (method !== 'POST') return fail(405, 'method');
      if (limiter.hit('mkproj:' + u.id, 30, HOUR)) return fail(429, 'rate_limit');
      if ((q.countOwned.get(u.id) as { n: number }).n >= maxProjects) return fail(403, 'too_many_projects');
      const j = await readJson(req, maxProject);
      if (j === TOO_BIG) return fail(413, 'too_large');
      if (j === BAD) return fail(415, 'content_type');
      let imported;
      try { imported = importNative(JSON.stringify(j)).model; } catch { return fail(400, 'invalid_document'); }
      const id = rid(), t = now();
      tx(db, () => {
        q.insProject.run(id, u.id, imported.name, t, t, exportNative(imported).output);
        q.insMember.run(id, u.id, 'owner', t);
      });
      return send(201, { id, name: imported.name, role: 'owner' });
    }

    if ((m = /^\/api\/projects\/([^/]+)(?:\/(members|invites)(?:\/([^/]+))?|\/(transfer))?$/.exec(path))) {
      const u = need(); if (isRes(u)) return u;
      const [, pid, sub, subId, transfer] = m;
      if (!ID_RE.test(pid!)) return fail(404, 'not_found');
      const my = getRole(pid!, u.id);
      if (!my) return fail(404, 'not_found'); // ne révèle pas l'existence d'un projet auquel on n'a pas accès

      if (!sub && !transfer) {
        if (method === 'GET') {
          const p = q.project.get(pid!) as { snapshot: string; updated_at: number };
          return new Response(p.snapshot, { status: 200, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'X-Role': my, 'X-Updated-At': new Date(p.updated_at).toISOString() } });
        }
        if (method === 'DELETE') {
          if (!atLeast(my, 'owner')) return fail(403, 'forbidden');
          q.delProject.run(pid!);
          return send(204);
        }
        return fail(405, 'method');
      }

      if (sub === 'members' && !subId && method === 'GET') {
        const members = (q.members.all(pid!) as Array<{ user_id: string; role: Role; name: string; email: string }>).map((x) => ({
          userId: x.user_id, role: x.role, name: x.name,
          email: atLeast(my, 'editor') || x.user_id === u.id ? x.email : undefined,
        }));
        const invites = atLeast(my, 'owner') ? (q.invites.all(pid!, now()) as Array<Record<string, unknown>>).map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: new Date(i.expires_at as number).toISOString() })) : [];
        return send(200, { role: my, members, invites });
      }

      if (sub === 'members' && subId) {
        if (!ID_RE.test(subId)) return fail(404, 'not_found');
        const target = getRole(pid!, subId);
        if (!target) return fail(404, 'not_found');
        if (method === 'DELETE') {
          if (subId !== u.id && !atLeast(my, 'owner')) return fail(403, 'forbidden');
          if (target === 'owner') return fail(409, 'owner_cannot_leave');
          q.delMember.run(pid!, subId);
          return send(204);
        }
        if (method === 'PUT') {
          if (!atLeast(my, 'owner')) return fail(403, 'forbidden');
          if (target === 'owner') return fail(409, 'owner_role_fixed');
          const b = await body(S.setRole); if (!b.ok) return b.res;
          q.setRole.run(b.data.role, pid!, subId);
          return send(204);
        }
        return fail(405, 'method');
      }

      if (sub === 'invites' && !subId && method === 'POST') {
        if (!atLeast(my, 'owner')) return fail(403, 'forbidden');
        const b = await body(S.invite); if (!b.ok) return b.res;
        if (limiter.hit('invite:' + u.id, 50, HOUR)) return fail(429, 'rate_limit');
        const target = q.userByEmail.get(b.data.email) as unknown as UserRow | undefined;
        if (target && getRole(pid!, target.id)) return send(204); // déjà membre : même réponse, rien à faire
        const id = rid(), t = now();
        q.upsertInvite.run(id, pid, b.data.email, b.data.role, u.id, t, t + 14 * DAY);
        const p = q.project.get(pid!) as { name: string };
        await mailer.send(compose('invite', target?.locale ?? u.locale, b.data.email, { who: u.name, project: p.name, role: b.data.role, url: `${base}/#/invitations` }));
        return send(204);
      }
      if (sub === 'invites' && subId && method === 'DELETE') {
        if (!atLeast(my, 'owner')) return fail(403, 'forbidden');
        q.delInviteOf.run(subId, pid!);
        return send(204);
      }

      if (transfer && method === 'POST') {
        if (!atLeast(my, 'owner')) return fail(403, 'forbidden');
        const b = await body(S.transfer); if (!b.ok) return b.res;
        if (b.data.userId === u.id || !getRole(pid!, b.data.userId)) return fail(400, 'invalid_target');
        tx(db, () => {
          q.reown.run(b.data.userId, pid!);
          q.insMember.run(pid!, b.data.userId, 'owner', now());
          q.insMember.run(pid!, u.id, 'editor', now());
        });
        return send(204);
      }
      return fail(405, 'method');
    }

    return fail(404, 'not_found');
  };

  return {
    handler,
    cookieName,
    userOf: (req) => sessionOf(req)?.user ?? null,
    roleOf: getRole,
  };
}

/** Ménage horaire : sessions, jetons et invitations échus. */
/** Supprime un compte : projets dont il est propriétaire transférés à un autre membre (éditeur d'abord) ou supprimés, puis le compte. */
export function eraseUser(db: Db, userId: string, t: number): void {
  tx(db, () => {
    for (const p of db.prepare('SELECT id FROM projects WHERE owner_id = ?').all(userId) as Array<{ id: string }>) {
      const next = db.prepare("SELECT user_id FROM members WHERE project_id = ? AND user_id <> ? ORDER BY CASE role WHEN 'editor' THEN 0 ELSE 1 END, created_at LIMIT 1").get(p.id, userId) as { user_id: string } | undefined;
      if (next) {
        db.prepare('UPDATE projects SET owner_id = ? WHERE id = ?').run(next.user_id, p.id);
        db.prepare("INSERT INTO members (project_id,user_id,role,created_at) VALUES (?,?,'owner',?) ON CONFLICT(project_id,user_id) DO UPDATE SET role = 'owner'").run(p.id, next.user_id, t);
      } else db.prepare('DELETE FROM projects WHERE id = ?').run(p.id);
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });
}

/** Durée d'inactivité avant suppression (24 mois) et préavis par mail (30 jours) : annoncés dans la politique de confidentialité. */
export const INACTIVE_AFTER = 730 * DAY, INACTIVE_NOTICE = 30 * DAY;

/**
 * Comptes inactifs : un mail d'avertissement 30 jours avant l'échéance, puis suppression si aucune connexion entre-temps.
 * Une connexion remet le compteur à zéro. Renvoie le nombre d'avertissements et de suppressions (pour les tests et les journaux).
 */
export async function sweepInactive(db: Db, mailer: Mailer, publicUrl: string, t: number): Promise<{ warned: number; erased: number }> {
  const base = publicUrl.replace(/\/+$/, '');
  let warned = 0, erased = 0;
  const due = db.prepare('SELECT id FROM users WHERE purge_warned_at IS NOT NULL AND purge_warned_at <= ? AND last_seen_at <= ?').all(t - INACTIVE_NOTICE + HOUR, t - (INACTIVE_AFTER - INACTIVE_NOTICE)) as Array<{ id: string }>;
  for (const u of due) { eraseUser(db, u.id, t); erased++; }
  const soon = db.prepare('SELECT id, email, name, locale, last_seen_at FROM users WHERE purge_warned_at IS NULL AND last_seen_at <= ?').all(t - (INACTIVE_AFTER - INACTIVE_NOTICE)) as unknown as Array<{ id: string; email: string; name: string; locale: string; last_seen_at: number }>;
  for (const u of soon) {
    const date = new Date(t + INACTIVE_NOTICE).toISOString().slice(0, 10);
    try { await mailer.send(compose('inactive', u.locale, u.email, { name: u.name, date, url: base + '/' })); } catch { continue; } // pas de suppression sans préavis réussi
    db.prepare('UPDATE users SET purge_warned_at = ? WHERE id = ?').run(t, u.id);
    warned++;
  }
  return { warned, erased };
}

export function sweepAccounts(db: Db, now: number): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  db.prepare('DELETE FROM tokens WHERE expires_at <= ?').run(now);
  db.prepare('DELETE FROM invites WHERE expires_at <= ?').run(now);
}
