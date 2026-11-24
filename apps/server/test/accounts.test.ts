import { beforeEach, describe, expect, it } from 'vitest';
import { exportNative } from '@grafcet/io';
import { demoProject } from '../../../packages/grafcet-core/test/helpers';
import { createAccounts, INACTIVE_AFTER, INACTIVE_NOTICE, sweepInactive, type Accounts } from '../src/accounts';
import { openDb, type Db } from '../src/db';
import { MemoryMailer } from '../src/mailer';

const FAST = { N: 1024, r: 8, p: 1 };
const PW = 'correct horse battery';
let clock: number, mailer: MemoryMailer, acc: Accounts, db: Db;
const doc = () => exportNative(demoProject()).output;

const make = (o: Partial<Parameters<typeof createAccounts>[0]> = {}) => {
  mailer = new MemoryMailer();
  db = openDb(':memory:');
  acc = createAccounts({ db, mailer, publicUrl: 'https://app.test', now: () => clock, scryptCost: FAST, ...o });
};
beforeEach(() => { clock = 1_700_000_000_000; make(); });

interface Req { method?: string; body?: unknown; cookie?: string; origin?: string; ip?: string; raw?: string; type?: string }
const call = (path: string, r: Req = {}) => acc.handler(new Request('http://app.test' + path, {
  method: r.method ?? (r.body !== undefined || r.raw !== undefined ? 'POST' : 'GET'),
  headers: { ...(r.cookie ? { cookie: r.cookie } : {}), ...(r.origin ? { origin: r.origin } : {}), ...(r.body !== undefined || r.raw !== undefined ? { 'content-type': r.type ?? 'application/json' } : {}) },
  body: r.raw ?? (r.body !== undefined ? JSON.stringify(r.body) : undefined),
}), { ip: r.ip ?? '9.9.9.9' });

const cookieOf = (res: Response): string => (res.headers.get('set-cookie') ?? '').split(';')[0]!;
const tokenIn = (to: string): string => /#\/\w+\/(\S+)/.exec(mailer.last(to)!.text)![1]!;

async function signup(email: string, name = 'Alice', verify = true): Promise<string> {
  expect((await call('/api/auth/register', { body: { email, name, password: PW } })).status).toBe(202);
  if (verify) expect((await call('/api/auth/verify', { body: { token: tokenIn(email) } })).status).toBe(204);
  const res = await call('/api/auth/login', { body: { email, password: PW } });
  expect(res.status).toBe(200);
  return cookieOf(res);
}
const newProject = async (cookie: string) => ((await (await call('/api/projects', { body: JSON.parse(doc()), cookie })).json()) as { id: string }).id;

describe('inscription et connexion', () => {
  it('inscrit, vérifie l\'email puis connecte ; le cookie est HttpOnly et SameSite', async () => {
    await call('/api/auth/register', { body: { email: 'Alice@Ex.fr', name: 'Alice', password: PW } });
    expect(mailer.last('alice@ex.fr')?.text).toContain('https://app.test/#/verify/');
    const res = await call('/api/auth/login', { body: { email: 'alice@ex.fr', password: PW } });
    const sc = res.headers.get('set-cookie')!;
    expect(sc).toMatch(/HttpOnly/);
    expect(sc).toMatch(/SameSite=Lax/);
    const me = await (await call('/api/me', { cookie: cookieOf(res) })).json() as { user: { emailVerified: boolean } };
    expect(me.user.emailVerified).toBe(false);
    await call('/api/auth/verify', { body: { token: tokenIn('alice@ex.fr') } });
    expect(((await (await call('/api/me', { cookie: cookieOf(res) })).json()) as { user: { emailVerified: boolean } }).user.emailVerified).toBe(true);
  });
  it('le jeton de vérification est à usage unique', async () => {
    await call('/api/auth/register', { body: { email: 'a@ex.fr', name: 'A', password: PW } });
    const t = tokenIn('a@ex.fr');
    expect((await call('/api/auth/verify', { body: { token: t } })).status).toBe(204);
    expect((await call('/api/auth/verify', { body: { token: t } })).status).toBe(400);
  });
  it('ne révèle pas si un compte existe (même réponse, mail « compte existant »)', async () => {
    await signup('a@ex.fr');
    const res = await call('/api/auth/register', { body: { email: 'a@ex.fr', name: 'X', password: PW } });
    expect(res.status).toBe(202);
    expect(mailer.last('a@ex.fr')!.subject).toMatch(/déjà un compte/);
    const bad = await call('/api/auth/login', { body: { email: 'inconnu@ex.fr', password: PW } });
    const wrong = await call('/api/auth/login', { body: { email: 'a@ex.fr', password: 'mauvais mot de passe' } });
    expect(bad.status).toBe(401); expect(wrong.status).toBe(401);
    expect(await bad.json()).toEqual(await wrong.json());
  });
  it('refuse un mot de passe trop court, un email invalide, un type de contenu autre', async () => {
    expect(await (await call('/api/auth/register', { body: { email: 'a@ex.fr', name: 'A', password: 'court' } })).json()).toEqual({ error: 'password_too_short' });
    expect((await call('/api/auth/register', { body: { email: 'pas-un-email', name: 'A', password: PW } })).status).toBe(400);
    expect((await call('/api/auth/register', { raw: 'x', type: 'text/plain' })).status).toBe(415);
  });
  it('ne conserve jamais le mot de passe en clair et limite les essais de connexion', async () => {
    await signup('a@ex.fr');
    for (let i = 0; i < 8; i++) await call('/api/auth/login', { body: { email: 'a@ex.fr', password: 'faux faux faux faux' } });
    expect((await call('/api/auth/login', { body: { email: 'a@ex.fr', password: PW } })).status).toBe(429);
    clock += 16 * 60_000;
    expect((await call('/api/auth/login', { body: { email: 'a@ex.fr', password: PW } })).status).toBe(200);
  });
  it('déconnecte, et la session expire', async () => {
    const c = await signup('a@ex.fr');
    expect((await call('/api/me', { cookie: c })).status).toBe(200);
    clock += 31 * 86_400_000;
    expect((await call('/api/me', { cookie: c })).status).toBe(401);
    const c2 = cookieOf(await call('/api/auth/login', { body: { email: 'a@ex.fr', password: PW } }));
    expect((await call('/api/auth/logout', { method: 'POST', cookie: c2, body: {} })).status).toBe(204);
    expect((await call('/api/me', { cookie: c2 })).status).toBe(401);
  });
  it('refuse une requête qui modifie depuis une autre origine', async () => {
    const c = await signup('a@ex.fr');
    expect((await call('/api/projects', { body: JSON.parse(doc()), cookie: c, origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('/api/projects', { body: JSON.parse(doc()), cookie: c, origin: 'http://app.test' })).status).toBe(201);
  });
});

describe('mot de passe oublié et changement', () => {
  it('réinitialise, révoque les sessions, et le jeton ne sert qu\'une fois', async () => {
    const c = await signup('a@ex.fr');
    expect((await call('/api/auth/forgot', { body: { email: 'inconnu@ex.fr' } })).status).toBe(202);
    expect(mailer.last('inconnu@ex.fr')).toBeUndefined();
    await call('/api/auth/forgot', { body: { email: 'a@ex.fr' } });
    const t = tokenIn('a@ex.fr');
    expect((await call('/api/auth/reset', { body: { token: t, password: 'nouveau mot de passe' } })).status).toBe(204);
    expect((await call('/api/auth/reset', { body: { token: t, password: 'encore un autre mdp' } })).status).toBe(400);
    expect((await call('/api/me', { cookie: c })).status).toBe(401);
    expect((await call('/api/auth/login', { body: { email: 'a@ex.fr', password: 'nouveau mot de passe' } })).status).toBe(200);
  });
  it('change le mot de passe (ancien requis) et garde seulement la session courante', async () => {
    const c1 = await signup('a@ex.fr');
    const c2 = cookieOf(await call('/api/auth/login', { body: { email: 'a@ex.fr', password: PW } }));
    expect((await call('/api/me/password', { body: { current: 'faux faux faux', next: 'nouveau mot de passe' }, cookie: c1 })).status).toBe(403);
    expect((await call('/api/me/password', { body: { current: PW, next: 'nouveau mot de passe' }, cookie: c1 })).status).toBe(204);
    expect((await call('/api/me', { cookie: c1 })).status).toBe(200);
    expect((await call('/api/me', { cookie: c2 })).status).toBe(401);
  });
});

describe('projets et rôles', () => {
  it('crée un projet (propriétaire), le liste, le relit et le supprime', async () => {
    const c = await signup('a@ex.fr');
    const id = await newProject(c);
    const list = await (await call('/api/projects', { cookie: c })).json() as { projects: Array<{ id: string; role: string }> };
    expect(list.projects).toMatchObject([{ id, role: 'owner' }]);
    const get = await call(`/api/projects/${id}`, { cookie: c });
    expect(await get.text()).toBe(doc());
    expect(get.headers.get('x-role')).toBe('owner');
    expect((await call(`/api/projects/${id}`, { method: 'DELETE', cookie: c })).status).toBe(204);
    expect((await call(`/api/projects/${id}`, { cookie: c })).status).toBe(404);
  });
  it('refuse un document invalide et exige d\'être connecté', async () => {
    const c = await signup('a@ex.fr');
    expect((await call('/api/projects', { body: { format: 'autre' }, cookie: c })).status).toBe(400);
    expect((await call('/api/projects', { body: JSON.parse(doc()) })).status).toBe(401);
  });
  it('un projet d\'autrui est invisible (404, pas 403)', async () => {
    const a = await signup('a@ex.fr'), b = await signup('b@ex.fr', 'Bob');
    const id = await newProject(a);
    expect((await call(`/api/projects/${id}`, { cookie: b })).status).toBe(404);
    expect((await call(`/api/projects/${id}`, { method: 'DELETE', cookie: b })).status).toBe(404);
  });
  it('invitation : seul l\'email vérifié concerné peut accepter ; le rôle est celui de l\'invitation', async () => {
    const a = await signup('a@ex.fr'), b = await signup('b@ex.fr', 'Bob', false);
    const verifyB = tokenIn('b@ex.fr');
    const id = await newProject(a);
    expect((await call(`/api/projects/${id}/invites`, { body: { email: 'b@ex.fr', role: 'viewer' }, cookie: a })).status).toBe(204);
    expect(mailer.last('b@ex.fr')!.text).toContain('https://app.test/#/invitations');
    // Bob n'a pas vérifié son email : pas d'invitation visible, pas d'acceptation.
    expect(((await (await call('/api/me', { cookie: b })).json()) as { invitations: unknown[] }).invitations).toEqual([]);
    await call('/api/auth/verify', { body: { token: verifyB } });
    const inv = ((await (await call('/api/me', { cookie: b })).json()) as { invitations: Array<{ id: string }> }).invitations;
    expect(inv).toHaveLength(1);
    const c = await signup('c@ex.fr', 'Carl');
    expect((await call(`/api/invitations/${inv[0]!.id}`, { method: 'POST', body: {}, cookie: c })).status).toBe(404);
    expect((await call(`/api/invitations/${inv[0]!.id}`, { method: 'POST', body: {}, cookie: b })).status).toBe(200);
    const got = await call(`/api/projects/${id}`, { cookie: b });
    expect(got.status).toBe(200);
    expect(got.headers.get('x-role')).toBe('viewer');
  });
  it('seul le propriétaire invite, change les rôles et retire ; un membre peut partir', async () => {
    const a = await signup('a@ex.fr'), b = await signup('b@ex.fr', 'Bob');
    const id = await newProject(a);
    await call(`/api/projects/${id}/invites`, { body: { email: 'b@ex.fr', role: 'editor' }, cookie: a });
    const inv = ((await (await call('/api/me', { cookie: b })).json()) as { invitations: Array<{ id: string }> }).invitations[0]!;
    await call(`/api/invitations/${inv.id}`, { method: 'POST', body: {}, cookie: b });
    expect((await call(`/api/projects/${id}/invites`, { body: { email: 'x@ex.fr', role: 'viewer' }, cookie: b })).status).toBe(403);
    const members = ((await (await call(`/api/projects/${id}/members`, { cookie: a })).json()) as { members: Array<{ userId: string; role: string; name: string }> }).members;
    expect(members.map((m) => m.role)).toEqual(['owner', 'editor']);
    const bob = members.find((m) => m.role === 'editor')!, alice = members.find((m) => m.role === 'owner')!;
    expect((await call(`/api/projects/${id}/members/${bob.userId}`, { method: 'PUT', body: { role: 'viewer' }, cookie: b })).status).toBe(403);
    expect((await call(`/api/projects/${id}/members/${bob.userId}`, { method: 'PUT', body: { role: 'viewer' }, cookie: a })).status).toBe(204);
    expect((await call(`/api/projects/${id}/members/${alice.userId}`, { method: 'DELETE', cookie: a })).status).toBe(409);
    expect((await call(`/api/projects/${id}/members/${bob.userId}`, { method: 'DELETE', cookie: b })).status).toBe(204); // il quitte
    expect((await call(`/api/projects/${id}`, { cookie: b })).status).toBe(404);
  });
  it('transfère la propriété', async () => {
    const a = await signup('a@ex.fr'), b = await signup('b@ex.fr', 'Bob');
    const id = await newProject(a);
    await call(`/api/projects/${id}/invites`, { body: { email: 'b@ex.fr', role: 'editor' }, cookie: a });
    const inv = ((await (await call('/api/me', { cookie: b })).json()) as { invitations: Array<{ id: string }> }).invitations[0]!;
    await call(`/api/invitations/${inv.id}`, { method: 'POST', body: {}, cookie: b });
    const bob = ((await (await call(`/api/projects/${id}/members`, { cookie: a })).json()) as { members: Array<{ userId: string; role: string }> }).members.find((m) => m.role === 'editor')!;
    expect((await call(`/api/projects/${id}/transfer`, { body: { userId: bob.userId }, cookie: a })).status).toBe(204);
    expect((await call(`/api/projects/${id}`, { method: 'DELETE', cookie: a })).status).toBe(403);
    expect((await call(`/api/projects/${id}`, { method: 'DELETE', cookie: b })).status).toBe(204);
  });
});

describe('droits RGPD', () => {
  it('exporte les données du compte', async () => {
    const c = await signup('a@ex.fr');
    await newProject(c);
    const r = await (await call('/api/me/export', { cookie: c })).json() as { user: { email: string }; projects: Array<{ document: unknown }> };
    expect(r.user.email).toBe('a@ex.fr');
    expect(r.projects[0]!.document).toBeTruthy();
  });
  it('supprime le compte : projets seuls supprimés, projets partagés transférés', async () => {
    const a = await signup('a@ex.fr'), b = await signup('b@ex.fr', 'Bob');
    const solo = await newProject(a), shared = await newProject(a);
    await call(`/api/projects/${shared}/invites`, { body: { email: 'b@ex.fr', role: 'viewer' }, cookie: a });
    const inv = ((await (await call('/api/me', { cookie: b })).json()) as { invitations: Array<{ id: string }> }).invitations[0]!;
    await call(`/api/invitations/${inv.id}`, { method: 'POST', body: {}, cookie: b });
    expect((await call('/api/me', { method: 'DELETE', body: { password: 'faux faux faux' }, cookie: a })).status).toBe(403);
    expect((await call('/api/me', { method: 'DELETE', body: { password: PW }, cookie: a })).status).toBe(204);
    expect((await call('/api/auth/login', { body: { email: 'a@ex.fr', password: PW } })).status).toBe(401);
    expect((await call(`/api/projects/${solo}`, { cookie: b })).status).toBe(404);
    const got = await call(`/api/projects/${shared}`, { cookie: b });
    expect(got.status).toBe(200);
    expect(got.headers.get('x-role')).toBe('owner');
  });
});

describe('inscriptions fermées', () => {
  it('n\'accepte que les personnes invitées', async () => {
    make({ allowRegistration: false });
    expect((await call('/api/auth/register', { body: { email: 'z@ex.fr', name: 'Z', password: PW } })).status).toBe(403);
  });
});

describe('comptes inactifs', () => {
  const sweep = () => sweepInactive(db, mailer, 'https://app.test', clock);
  const exists = (email: string): boolean => !!db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);

  it('avertit 30 jours avant, puis supprime le compte et ses projets', async () => {
    const a = await signup('a@ex.fr');
    await newProject(a);
    expect(await sweep()).toEqual({ warned: 0, erased: 0 });
    clock += INACTIVE_AFTER - INACTIVE_NOTICE + 1000;
    expect(await sweep()).toEqual({ warned: 1, erased: 0 });
    expect(mailer.last('a@ex.fr')?.subject).toMatch(/supprimé/);
    expect(await sweep()).toEqual({ warned: 0, erased: 0 }); // un seul avertissement
    clock += INACTIVE_NOTICE;
    expect(await sweep()).toEqual({ warned: 0, erased: 1 });
    expect(exists('a@ex.fr')).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS n FROM projects').get()).toEqual({ n: 0 });
  });

  it('une connexion après l\'avertissement conserve le compte', async () => {
    await signup('b@ex.fr');
    clock += INACTIVE_AFTER - INACTIVE_NOTICE + 1000;
    await sweep();
    expect((await call('/api/auth/login', { body: { email: 'b@ex.fr', password: PW } })).status).toBe(200);
    clock += INACTIVE_NOTICE + 1000;
    expect(await sweep()).toEqual({ warned: 0, erased: 0 });
    expect(exists('b@ex.fr')).toBe(true);
  });

  it('ne supprime pas sans avertissement envoyé', async () => {
    await signup('c@ex.fr');
    clock += INACTIVE_AFTER + 10 * 86_400_000;
    mailer.send = async () => { throw new Error('smtp'); };
    expect(await sweep()).toEqual({ warned: 0, erased: 0 });
    expect(exists('c@ex.fr')).toBe(true);
  });
});
