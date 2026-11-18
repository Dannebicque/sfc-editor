import { beforeEach, describe, expect, it } from 'vitest';
import { exportNative } from '@grafcet/io';
import { demoProject } from '../../../packages/grafcet-core/test/helpers';
import { createAccounts, sweepAccounts, type Accounts } from '../src/accounts';
import { openDb, type Db } from '../src/db';
import { MemoryMailer } from '../src/mailer';
import { stats } from '../src/usage';

const FAST = { N: 1024, r: 8, p: 1 };
let clock: number, acc: Accounts, db: Db, mailer: MemoryMailer;
const doc = () => exportNative(demoProject()).output;
const make = (o: Partial<Parameters<typeof createAccounts>[0]> = {}) => {
  mailer = new MemoryMailer(); db = openDb(':memory:');
  acc = createAccounts({ db, mailer, publicUrl: 'https://app.test', now: () => clock, scryptCost: FAST, ...o });
};
beforeEach(() => { clock = 1_700_000_000_000; make(); });
const post = (path: string, body: unknown, ip = '1.1.1.1') => acc.handler(new Request('http://app.test' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { ip });
const rows = (sql: string) => db.prepare(sql).all() as Array<Record<string, unknown>>;

describe('liste d\'attente', () => {
  it('enregistre une fois, répond pareil pour un doublon, exige le consentement', async () => {
    expect((await post('/api/waitlist', { email: 'Prof@Ecole.fr', kind: 'teacher', locale: 'fr', consent: true })).status).toBe(202);
    expect((await post('/api/waitlist', { email: 'prof@ecole.fr', kind: 'school', consent: true })).status).toBe(202);
    expect(rows('SELECT email, kind FROM waitlist')).toEqual([{ email: 'prof@ecole.fr', kind: 'teacher' }]);
    expect(stats(db, clock).events.waitlist).toBe(1);
    expect((await post('/api/waitlist', { email: 'x@y.fr', kind: 'teacher', consent: false })).status).toBe(400);
    expect((await post('/api/waitlist', { email: 'pas-un-email', kind: 'teacher', consent: true })).status).toBe(400);
    expect((await post('/api/waitlist', { email: 'x@y.fr', kind: 'autre', consent: true })).status).toBe(400);
  });
  it('limite le débit par adresse', async () => {
    for (let i = 0; i < 10; i++) await post('/api/waitlist', { email: `a${i}@y.fr`, kind: 'other', consent: true }, '2.2.2.2');
    expect((await post('/api/waitlist', { email: 'z@y.fr', kind: 'other', consent: true }, '2.2.2.2')).status).toBe(429);
  });
  it('est purgée après 24 mois', async () => {
    await post('/api/waitlist', { email: 'a@y.fr', kind: 'other', consent: true });
    sweepAccounts(db, clock + 729 * 86_400_000);
    expect(rows('SELECT 1 FROM waitlist').length).toBe(1);
    sweepAccounts(db, clock + 731 * 86_400_000);
    expect(rows('SELECT 1 FROM waitlist').length).toBe(0);
  });
});

describe('compteurs d\'usage', () => {
  it('ne comptent que les événements connus, sans rien conserver d\'identifiant', async () => {
    expect((await post('/api/usage', { event: 'limit_steps' })).status).toBe(204);
    expect((await post('/api/usage', { event: 'limit_steps' })).status).toBe(204);
    expect((await post('/api/usage', { event: 'register' })).status).toBe(204); // réservé au serveur
    expect((await post('/api/usage', { event: 'n\'importe quoi' })).status).toBe(204);
    expect(stats(db, clock).events).toEqual({ limit_steps: 2 });
    expect(rows('SELECT * FROM usage_daily')[0]).toEqual({ day: '2023-11-14', event: 'limit_steps', n: 2 });
  });
  it('comptent les inscriptions et la création de projets côté serveur', async () => {
    await post('/api/auth/register', { email: 'a@ex.fr', name: 'A', password: 'correct horse battery' });
    expect(stats(db, clock).events.register).toBe(1);
  });
});

describe('plafond de projets en ligne', () => {
  it('refuse la création au-delà du plafond, sans toucher à l\'existant', async () => {
    make({ maxProjectsPerUser: 2 });
    await post('/api/auth/register', { email: 'a@ex.fr', name: 'A', password: 'correct horse battery' });
    const tok = /#\/verify\/(\S+)/.exec(mailer.last('a@ex.fr')!.text)![1]!;
    await post('/api/auth/verify', { token: tok });
    const login = await post('/api/auth/login', { email: 'a@ex.fr', password: 'correct horse battery' });
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    const create = () => acc.handler(new Request('http://app.test/api/projects', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: doc() }), { ip: '1.1.1.1' });
    expect((await create()).status).toBe(201);
    expect((await create()).status).toBe(201);
    const r = await create();
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toBe('too_many_projects');
    expect(stats(db, clock).events.project_created).toBe(2);
  });
});

describe('co-édition réservée à l\'offre classe', () => {
  const invite = async (cookie: string, pid: string) => acc.handler(new Request(`http://app.test/api/projects/${pid}/invites`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ email: 'b@ex.fr', role: 'editor' }) }), { ip: '1.1.1.1' });
  async function owner(): Promise<{ cookie: string; pid: string }> {
    await post('/api/auth/register', { email: 'a@ex.fr', name: 'A', password: 'correct horse battery' });
    await post('/api/auth/verify', { token: /#\/verify\/(\S+)/.exec(mailer.last('a@ex.fr')!.text)![1]! });
    const cookie = ((await post('/api/auth/login', { email: 'a@ex.fr', password: 'correct horse battery' })).headers.get('set-cookie') ?? '').split(';')[0]!;
    const r = await acc.handler(new Request('http://app.test/api/projects', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: doc() }), { ip: '1.1.1.1' });
    return { cookie, pid: ((await r.json()) as { id: string }).id };
  }
  it('refuse d\'inviter sans l\'offre, accepte avec', async () => {
    make({ collabRequiresPlan: true });
    const { cookie, pid } = await owner();
    const r = await invite(cookie, pid);
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toBe('plan_required');
    db.prepare("UPDATE users SET plan = 'teacher' WHERE email = 'a@ex.fr'").run();
    expect((await invite(cookie, pid)).status).toBe(204);
  });
  it('reste ouverte par défaut (auto-hébergement)', async () => {
    const { cookie, pid } = await owner();
    expect((await invite(cookie, pid)).status).toBe(204);
  });
});
