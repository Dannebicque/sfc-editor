import { beforeEach, describe, expect, it } from 'vitest';
import { exportNative } from '@grafcet/io';
import { demoProject } from '../../../packages/grafcet-core/test/helpers';
import { createAccounts, eraseUser, type Accounts } from '../src/accounts';
import { openDb, type Db } from '../src/db';
import { MemoryMailer } from '../src/mailer';

const FAST = { N: 1024, r: 8, p: 1 };
const PW = 'correct horse battery';
let clock: number, mailer: MemoryMailer, acc: Accounts, db: Db;
const doc = () => JSON.parse(exportNative(demoProject()).output);

const make = (o: Partial<Parameters<typeof createAccounts>[0]> = {}) => {
  mailer = new MemoryMailer();
  db = openDb(':memory:');
  acc = createAccounts({ db, mailer, publicUrl: 'https://app.test', now: () => clock, scryptCost: FAST, ...o });
};
beforeEach(() => { clock = 1_700_000_000_000; make({ collabRequiresPlan: true }); });

interface Req { method?: string; body?: unknown; cookie?: string }
const call = (path: string, r: Req = {}) => acc.handler(new Request('http://app.test' + path, {
  method: r.method ?? (r.body !== undefined ? 'POST' : 'GET'),
  headers: { ...(r.cookie ? { cookie: r.cookie } : {}), ...(r.body !== undefined ? { 'content-type': 'application/json' } : {}) },
  body: r.body !== undefined ? JSON.stringify(r.body) : undefined,
}), { ip: '9.9.9.9' });
const json = async <T = any>(res: Response): Promise<T> => (await res.json()) as T;
const cookieOf = (res: Response): string => (res.headers.get('set-cookie') ?? '').split(';')[0]!;
const tokenIn = (to: string): string => /#\/\w+\/(\S+)/.exec(mailer.last(to)!.text)![1]!;

async function signup(email: string, name: string): Promise<string> {
  await call('/api/auth/register', { body: { email, name, password: PW } });
  await call('/api/auth/verify', { body: { token: tokenIn(email) } });
  return cookieOf(await call('/api/auth/login', { body: { email, password: PW } }));
}
/** Active un compte créé par l'enseignant·e : l'élève ouvre le lien du mail et choisit son mot de passe. */
async function activate(email: string): Promise<string> {
  expect((await call('/api/auth/reset', { body: { token: tokenIn(email), password: PW } })).status).toBe(204);
  return cookieOf(await call('/api/auth/login', { body: { email, password: PW } }));
}
const teacherCookie = async () => { const c = await signup('prof@ex.fr', 'Mme Prof'); db.prepare("UPDATE users SET plan = 'teacher' WHERE email = 'prof@ex.fr'").run(); return c; };

async function setup() {
  const prof = await teacherCookie();
  const { id: cid } = await json(await call('/api/classes', { body: { name: 'Term STI2D' }, cookie: prof }));
  const imp = await json(await call(`/api/classes/${cid}/students`, { body: { students: [{ name: 'Léa', email: 'lea@ex.fr' }, { name: 'Tom', email: 'tom@ex.fr' }] }, cookie: prof }));
  const lea = await activate('lea@ex.fr'), tom = await activate('tom@ex.fr');
  return { prof, cid: cid as string, imp, lea, tom };
}
const publish = async (prof: string, cid: string, extra: object = {}) =>
  json<{ id: string }>(await call(`/api/classes/${cid}/assignments`, { body: { title: 'Portail', instructions: 'Dessinez le cycle.', document: doc(), ...extra }, cookie: prof }));

describe('classes : création et droits', () => {
  it('réserve la création à l\'offre teacher quand le plan est exigé, et à un email vérifié', async () => {
    const free = await signup('free@ex.fr', 'Free');
    expect((await call('/api/classes', { body: { name: 'X' }, cookie: free })).status).toBe(403);
    expect(await json(await call('/api/classes', { cookie: free }))).toMatchObject({ canTeach: false });
    expect((await call('/api/classes', { body: { name: 'X' } })).status).toBe(401);
    const prof = await teacherCookie();
    expect((await call('/api/classes', { body: { name: 'Ma classe' }, cookie: prof })).status).toBe(201);
    expect(await json(await call('/api/classes', { cookie: prof }))).toMatchObject({ teaching: [{ name: 'Ma classe', students: 0 }], canTeach: true });
  });
  it('sans COLLAB_REQUIRES_PLAN (auto-hébergement), tout compte vérifié peut créer une classe', async () => {
    make();
    const free = await signup('free@ex.fr', 'Free');
    expect((await call('/api/classes', { body: { name: 'X' }, cookie: free })).status).toBe(201);
  });
  it('ne révèle pas l\'existence d\'une classe à un tiers', async () => {
    const { cid } = await setup();
    const autre = await signup('autre@ex.fr', 'Autre');
    expect((await call(`/api/classes/${cid}`, { cookie: autre })).status).toBe(404);
    expect((await call(`/api/classes/${cid}/students`, { body: { students: [{ name: 'A', email: 'a@ex.fr' }] }, cookie: autre })).status).toBe(404);
  });
});

describe('élèves en lot', () => {
  it('crée les comptes, envoie le lien d\'activation et inscrit les élèves ; le mot de passe est choisi par l\'élève', async () => {
    const { prof, cid, imp, lea } = await setup();
    expect(imp.results).toEqual([{ email: 'lea@ex.fr', status: 'created' }, { email: 'tom@ex.fr', status: 'created' }]);
    const mail = mailer.sent.find((m) => m.to === 'lea@ex.fr')!;
    expect(mail.subject).toContain('Term STI2D');
    expect(mail.text).toContain('https://app.test/#/reset/');
    // L'enseignant·e ne peut pas se connecter à la place de l'élève : le hachage stocké n'est pas un mot de passe valide.
    const login = await call('/api/auth/login', { body: { email: 'lea@ex.fr', password: 'password-inconnu' } });
    expect(login.status).toBe(401);
    const c = await json(await call(`/api/classes/${cid}`, { cookie: prof }));
    expect(c.students).toEqual([{ userId: expect.any(String), name: 'Léa', email: 'lea@ex.fr', activated: true }, { userId: expect.any(String), name: 'Tom', email: 'tom@ex.fr', activated: true }]);
    expect(await json(await call('/api/classes', { cookie: lea }))).toMatchObject({ enrolled: [{ name: 'Term STI2D', teacher: 'Mme Prof' }] });
  });
  it('signale les doublons, les inscrits et les comptes non activés ; renvoie l\'activation', async () => {
    const prof = await teacherCookie();
    const { id: cid } = await json(await call('/api/classes', { body: { name: 'C' }, cookie: prof }));
    const body = { students: [{ name: 'A', email: 'a@ex.fr' }, { name: 'A bis', email: 'A@ex.fr' }, { name: 'Moi', email: 'prof@ex.fr' }] };
    expect((await json(await call(`/api/classes/${cid}/students`, { body, cookie: prof }))).results.map((r: any) => r.status)).toEqual(['created', 'duplicate', 'skipped']);
    expect((await json(await call(`/api/classes/${cid}/students`, { body: { students: [{ name: 'A', email: 'a@ex.fr' }] }, cookie: prof }))).results[0].status).toBe('already');
    const c = await json(await call(`/api/classes/${cid}`, { cookie: prof }));
    expect(c.students[0].activated).toBe(false);
    const before = mailer.sent.length;
    expect((await call(`/api/classes/${cid}/students/${c.students[0].userId}/resend`, { method: 'POST', body: {}, cookie: prof })).status).toBe(204);
    expect(mailer.sent.length).toBe(before + 1);
    await activate('a@ex.fr');
    expect((await call(`/api/classes/${cid}/students/${c.students[0].userId}/resend`, { method: 'POST', body: {}, cookie: prof })).status).toBe(409);
  });
  it('un compte déjà existant reçoit une invitation à accepter : il n\'est jamais inscrit de force', async () => {
    const prof = await teacherCookie();
    const maya = await signup('maya@ex.fr', 'Maya');
    const { id: cid } = await json(await call('/api/classes', { body: { name: 'C' }, cookie: prof }));
    await publish(prof, cid);
    expect((await json(await call(`/api/classes/${cid}/students`, { body: { students: [{ name: 'Maya', email: 'maya@ex.fr' }] }, cookie: prof }))).results[0].status).toBe('invited');
    expect(await json(await call('/api/classes', { cookie: maya }))).toMatchObject({ enrolled: [] });
    const me = await json(await call('/api/me', { cookie: maya }));
    expect(me.classInvitations).toHaveLength(1);
    expect(me.classInvitations[0]).toMatchObject({ class: 'C', invitedBy: 'Mme Prof' });
    expect((await call(`/api/class-invitations/${me.classInvitations[0].id}`, { body: {}, cookie: maya })).status).toBe(200);
    const mine = await json(await call(`/api/classes/${cid}`, { cookie: maya }));
    expect(mine.role).toBe('student');
    expect(mine.assignments[0].submission.status).toBe('todo'); // copie créée à l'inscription
  });
  it('refuse l\'acceptation à une autre personne, et la liste des élèves à un élève ne fuit pas', async () => {
    const prof = await teacherCookie();
    await signup('maya@ex.fr', 'Maya');
    const autre = await signup('autre@ex.fr', 'Autre');
    const { id: cid } = await json(await call('/api/classes', { body: { name: 'C' }, cookie: prof }));
    await call(`/api/classes/${cid}/students`, { body: { students: [{ name: 'Maya', email: 'maya@ex.fr' }] }, cookie: prof });
    const id = db.prepare('SELECT id FROM class_invites').get() as { id: string };
    expect((await call(`/api/class-invitations/${id.id}`, { body: {}, cookie: autre })).status).toBe(404);
  });
  it('limite le nombre de lignes et valide les adresses', async () => {
    const prof = await teacherCookie();
    const { id: cid } = await json(await call('/api/classes', { body: { name: 'C' }, cookie: prof }));
    expect((await call(`/api/classes/${cid}/students`, { body: { students: [{ name: 'A', email: 'pas-un-email' }] }, cookie: prof })).status).toBe(400);
    const many = Array.from({ length: 101 }, (_, i) => ({ name: 'E' + i, email: `e${i}@ex.fr` }));
    expect((await call(`/api/classes/${cid}/students`, { body: { students: many }, cookie: prof })).status).toBe(400);
  });
});

describe('sujets, copies, rendus', () => {
  it('copie le sujet pour chaque élève, puis pour un nouvel élève inscrit plus tard', async () => {
    const { prof, cid, lea, tom } = await setup();
    const { id: aid } = await publish(prof, cid);
    const a = await json(await call(`/api/classes/${cid}/assignments/${aid}`, { cookie: prof }));
    expect(a.submissions.map((s: any) => [s.name, s.status, s.access])).toEqual([['Léa', 'todo', null], ['Tom', 'todo', null]]);
    expect(a.submissions[0].projectId).not.toBe(a.submissions[1].projectId);
    // L'élève voit sa copie comme un projet ordinaire (propriétaire) ; l'autre élève n'y a pas accès.
    const mine = await json(await call(`/api/classes/${cid}/assignments/${aid}`, { cookie: lea }));
    const pid = mine.submission.projectId;
    expect((await call(`/api/projects/${pid}`, { cookie: lea })).headers.get('x-role')).toBe('owner');
    expect((await call(`/api/projects/${pid}`, { cookie: tom })).status).toBe(404);
    expect(mine.assignment.instructions).toBe('Dessinez le cycle.');
    expect(JSON.parse(await (await call(`/api/projects/${pid}`, { cookie: lea })).text()).project.name).toBe('Portail');
    // Un·e élève ne voit pas les rendus des autres.
    expect((await call(`/api/classes/${cid}/assignments/${aid}/submissions/${a.submissions[1].userId}/comments`, { cookie: lea })).status).toBe(404);
    // Inscription tardive.
    await call(`/api/classes/${cid}/students`, { body: { students: [{ name: 'Zoé', email: 'zoe@ex.fr' }] }, cookie: prof });
    const a2 = await json(await call(`/api/classes/${cid}/assignments/${aid}`, { cookie: prof }));
    expect(a2.submissions.map((s: any) => s.name)).toEqual(['Léa', 'Tom', 'Zoé']);
  });
  it('prend le sujet dans un projet dont l\'enseignant·e est propriétaire, figé à la publication', async () => {
    const { prof, cid, lea } = await setup();
    const { id: projectId } = await json(await call('/api/projects', { body: doc(), cookie: prof }));
    const { id: aid } = await json(await call(`/api/classes/${cid}/assignments`, { body: { title: 'Depuis projet', projectId }, cookie: prof }));
    expect((await call(`/api/projects/${projectId}`, { method: 'DELETE', cookie: prof })).status).toBe(204);
    const mine = await json(await call(`/api/classes/${cid}/assignments/${aid}`, { cookie: lea }));
    expect((await call(`/api/projects/${mine.submission.projectId}`, { cookie: lea })).status).toBe(200);
    // Un projet qui n'est pas le sien est refusé.
    expect((await call(`/api/classes/${cid}/assignments`, { body: { title: 'X', projectId: mine.submission.projectId }, cookie: prof })).status).toBe(404);
  });
  it('rend et reprend un travail ; seul l\'élève le fait', async () => {
    const { prof, cid, lea } = await setup();
    const { id: aid } = await publish(prof, cid);
    expect((await call(`/api/classes/${cid}/assignments/${aid}/submit`, { body: { submitted: true }, cookie: prof })).status).toBe(403);
    expect((await call(`/api/classes/${cid}/assignments/${aid}/submit`, { body: { submitted: true }, cookie: lea })).status).toBe(204);
    let list = await json(await call(`/api/classes/${cid}`, { cookie: prof }));
    expect(list.assignments[0]).toMatchObject({ students: 2, submitted: 1 });
    const a = await json(await call(`/api/classes/${cid}/assignments/${aid}`, { cookie: prof }));
    expect(a.submissions[0]).toMatchObject({ name: 'Léa', status: 'submitted', submittedAt: new Date(clock).toISOString() });
    await call(`/api/classes/${cid}/assignments/${aid}/submit`, { body: { submitted: false }, cookie: lea });
    list = await json(await call(`/api/classes/${cid}`, { cookie: prof }));
    expect(list.assignments[0].submitted).toBe(0);
  });
});

describe('ouvrir une copie et commenter', () => {
  it('l\'enseignant·e ouvre une copie en lecture seule puis en éditeur ; la co-édition est permise sans offre du propriétaire', async () => {
    const { prof, cid, lea } = await setup();
    const { id: aid } = await publish(prof, cid);
    const a = await json(await call(`/api/classes/${cid}/assignments/${aid}`, { cookie: prof }));
    const s = a.submissions[0];
    const prof_ = (await json(await call('/api/me', { cookie: prof }))).user.id as string;
    expect((await call(`/api/projects/${s.projectId}`, { cookie: prof })).status).toBe(404); // pas d'accès d'office
    const open = await json(await call(`/api/classes/${cid}/assignments/${aid}/submissions/${s.userId}/access`, { method: 'PUT', body: { role: 'viewer' }, cookie: prof }));
    expect(open).toEqual({ projectId: s.projectId, role: 'viewer' });
    expect((await call(`/api/projects/${s.projectId}`, { cookie: prof })).headers.get('x-role')).toBe('viewer');
    expect(acc.collabAllowed(s.projectId, prof_)).toBe(true);
    await call(`/api/classes/${cid}/assignments/${aid}/submissions/${s.userId}/access`, { method: 'PUT', body: { role: 'editor' }, cookie: prof });
    expect(acc.roleOf(s.projectId, prof_)).toBe('editor');
    // L'élève ne peut ni retirer ni rétrograder l'enseignant·e, ni supprimer ou céder sa copie.
    expect((await call(`/api/projects/${s.projectId}/members/${prof_}`, { method: 'DELETE', cookie: lea })).status).toBe(409);
    expect((await call(`/api/projects/${s.projectId}/members/${prof_}`, { method: 'PUT', body: { role: 'viewer' }, cookie: lea })).status).toBe(409);
    expect((await call(`/api/projects/${s.projectId}`, { method: 'DELETE', cookie: lea })).status).toBe(409);
    expect((await call(`/api/projects/${s.projectId}/transfer`, { body: { userId: prof_ }, cookie: lea })).status).toBe(409);
    // Un élève ne peut pas s'accorder l'accès à la copie d'un autre.
    expect((await call(`/api/classes/${cid}/assignments/${aid}/submissions/${s.userId}/access`, { method: 'PUT', body: { role: 'editor' }, cookie: lea })).status).toBe(403);
    // L'enseignant·e se retire.
    expect((await call(`/api/classes/${cid}/assignments/${aid}/submissions/${s.userId}/access`, { method: 'DELETE', cookie: prof })).status).toBe(204);
    expect(acc.roleOf(s.projectId, prof_)).toBeNull();
  });
  it('les commentaires sont écrits par l\'enseignant·e et lus par l\'élève concerné seulement', async () => {
    const { prof, cid, lea, tom } = await setup();
    const { id: aid } = await publish(prof, cid);
    const a = await json(await call(`/api/classes/${cid}/assignments/${aid}`, { cookie: prof }));
    const [sl, st] = a.submissions;
    const url = (uid: string) => `/api/classes/${cid}/assignments/${aid}/submissions/${uid}/comments`;
    expect((await call(url(sl.userId), { body: { body: 'Bien vu la divergence.' }, cookie: prof })).status).toBe(201);
    expect((await call(url(sl.userId), { body: { body: 'Je triche' }, cookie: lea })).status).toBe(403);
    expect((await call(url(sl.userId), { body: { body: '   ' }, cookie: prof })).status).toBe(400);
    expect((await json(await call(url(sl.userId), { cookie: lea }))).comments).toMatchObject([{ body: 'Bien vu la divergence.', author: 'Mme Prof' }]);
    expect((await json(await call(`/api/classes/${cid}/assignments/${aid}`, { cookie: lea }))).comments).toHaveLength(1);
    expect((await call(url(st.userId), { cookie: lea })).status).toBe(404);
    expect((await json(await call(url(st.userId), { cookie: tom }))).comments).toEqual([]);
    expect((await json(await call(`/api/classes/${cid}/assignments/${aid}`, { cookie: prof }))).submissions[0].comments).toBe(1);
  });
});

describe('fin de vie', () => {
  it('retirer un élève lui laisse sa copie mais ferme l\'accès de l\'enseignant·e', async () => {
    const { prof, cid, lea } = await setup();
    const { id: aid } = await publish(prof, cid);
    const a = await json(await call(`/api/classes/${cid}/assignments/${aid}`, { cookie: prof }));
    const s = a.submissions[0];
    await call(`/api/classes/${cid}/assignments/${aid}/submissions/${s.userId}/access`, { method: 'PUT', body: { role: 'editor' }, cookie: prof });
    expect((await call(`/api/classes/${cid}/students/${s.userId}`, { method: 'DELETE', cookie: prof })).status).toBe(204);
    expect((await call(`/api/projects/${s.projectId}`, { cookie: prof })).status).toBe(404);
    expect((await call(`/api/projects/${s.projectId}`, { cookie: lea })).status).toBe(200);
    expect((await call(`/api/projects/${s.projectId}`, { method: 'DELETE', cookie: lea })).status).toBe(204); // plus une copie de classe
    expect((await call(`/api/classes/${cid}`, { cookie: lea })).status).toBe(404);
  });
  it('un élève peut quitter la classe, mais pas en retirer un autre', async () => {
    const { cid, lea, tom } = await setup();
    const tid = (db.prepare("SELECT id FROM users WHERE email = 'tom@ex.fr'").get() as { id: string }).id;
    const lid = (db.prepare("SELECT id FROM users WHERE email = 'lea@ex.fr'").get() as { id: string }).id;
    expect((await call(`/api/classes/${cid}/students/${tid}`, { method: 'DELETE', cookie: lea })).status).toBe(403);
    expect((await call(`/api/classes/${cid}/students/${lid}`, { method: 'DELETE', cookie: lea })).status).toBe(204);
    expect((await call(`/api/classes/${cid}`, { cookie: tom })).status).toBe(200);
  });
  it('supprimer la classe retire les accès mais laisse les copies aux élèves', async () => {
    const { prof, cid, lea } = await setup();
    const { id: aid } = await publish(prof, cid);
    const s = (await json(await call(`/api/classes/${cid}/assignments/${aid}`, { cookie: prof }))).submissions[0];
    await call(`/api/classes/${cid}/assignments/${aid}/submissions/${s.userId}/access`, { method: 'PUT', body: { role: 'viewer' }, cookie: prof });
    const other = await signup('autre@ex.fr', 'Autre');
    expect((await call(`/api/classes/${cid}`, { method: 'DELETE', cookie: other })).status).toBe(404);
    expect((await call(`/api/classes/${cid}`, { method: 'DELETE', cookie: lea })).status).toBe(403);
    expect((await call(`/api/classes/${cid}`, { method: 'DELETE', cookie: prof })).status).toBe(204);
    expect((await call(`/api/projects/${s.projectId}`, { cookie: prof })).status).toBe(404);
    expect((await call(`/api/projects/${s.projectId}`, { cookie: lea })).status).toBe(200);
  });
  it('supprimer le compte d\'un élève supprime sa copie de classe (pas de transfert à l\'enseignant·e)', async () => {
    const { prof, cid } = await setup();
    const { id: aid } = await publish(prof, cid);
    const s = (await json(await call(`/api/classes/${cid}/assignments/${aid}`, { cookie: prof }))).submissions[0];
    await call(`/api/classes/${cid}/assignments/${aid}/submissions/${s.userId}/access`, { method: 'PUT', body: { role: 'editor' }, cookie: prof });
    await call(`/api/classes/${cid}/assignments/${aid}/submissions/${s.userId}/comments`, { body: { body: 'ok' }, cookie: prof });
    eraseUser(db, s.userId, clock);
    expect(db.prepare('SELECT COUNT(*) AS n FROM projects WHERE id = ?').get(s.projectId)).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM submission_comments').get()).toEqual({ n: 0 });
    const a = await json(await call(`/api/classes/${cid}/assignments/${aid}`, { cookie: prof }));
    expect(a.submissions.map((x: any) => x.name)).toEqual(['Tom']);
  });
  it('supprimer le compte de l\'enseignant·e supprime classes et sujets, les élèves gardent leurs copies', async () => {
    const { prof, cid, lea } = await setup();
    const { id: aid } = await publish(prof, cid);
    const mine = await json(await call(`/api/classes/${cid}/assignments/${aid}`, { cookie: lea }));
    const tid = (db.prepare("SELECT id FROM users WHERE email = 'prof@ex.fr'").get() as { id: string }).id;
    eraseUser(db, tid, clock);
    expect(db.prepare('SELECT COUNT(*) AS n FROM classes').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM assignments').get()).toEqual({ n: 0 });
    expect((await call(`/api/projects/${mine.submission.projectId}`, { cookie: lea })).status).toBe(200);
  });
});

describe('migration', () => {
  it('numérote la migration des classes à la suite de la 4', () => {
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(5);
  });
});
