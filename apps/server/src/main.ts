import { resolve } from 'node:path';
import { createAccounts, sweepAccounts, sweepInactive } from './accounts';
import { createApp, type Handler } from './app';
import { createCollab, type Collab } from './collab';
import { openDb, type Db } from './db';
import { ConsoleMailer, smtpMailer, type Mailer } from './mailer';
import { buildServer } from './server';
import { FileStore } from './store';

const env = process.env;
const num = (v: string | undefined, d: number): number => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const port = num(env.PORT, 8787), host = env.HOST ?? '127.0.0.1';
const dataDir = env.DATA_DIR ?? './data';

const store = new FileStore(dataDir);
const shares = createApp({ store, maxBytes: num(env.MAX_BYTES, 2_000_000), ttlDays: num(env.TTL_DAYS, 90), ratePerHour: num(env.RATE_PER_HOUR, 20), allowedOrigin: env.ALLOWED_ORIGIN });

// Comptes et co-édition (ADR 0005) : activés seulement si PUBLIC_URL (adresse publique de l'éditeur) est définie.
let accountsHandler: Handler | undefined;
let collab: Collab | undefined;
let db: Db | undefined;
if (env.PUBLIC_URL) {
  const production = env.NODE_ENV === 'production';
  let mailer: Mailer = new ConsoleMailer();
  if (env.SMTP_URL) mailer = await smtpMailer(env.SMTP_URL, env.MAIL_FROM ?? 'GRAFCET <no-reply@localhost>');
  else if (production) throw new Error('SMTP_URL est obligatoire en production (les liens de vérification partiraient dans les journaux).');
  db = openDb(env.DB_PATH ?? dataDir + '/app.db');
  const accounts = createAccounts({
    db, mailer, publicUrl: env.PUBLIC_URL, allowedOrigin: env.ALLOWED_ORIGIN ?? env.PUBLIC_URL,
    secureCookies: env.INSECURE_COOKIES !== '1' && (production || env.PUBLIC_URL.startsWith('https:')),
    allowRegistration: env.ALLOW_REGISTRATION !== '0',
    collabRequiresPlan: env.COLLAB_REQUIRES_PLAN === '1',
    maxProjectBytes: num(env.MAX_BYTES, 2_000_000),
    // Plafond de projets en ligne par personne (offre gratuite) ; les projets déjà créés au-delà restent accessibles.
    maxProjectsPerUser: num(env.MAX_PROJECTS_PER_USER, 5),
  });
  accountsHandler = accounts.handler;
  collab = createCollab({ db, accounts, allowedOrigin: env.ALLOWED_ORIGIN ?? env.PUBLIC_URL, maxProjectBytes: num(env.MAX_BYTES, 2_000_000) });
  setInterval(() => { sweepAccounts(db!, Date.now()); }, 3_600_000).unref();
  sweepAccounts(db, Date.now());
  const inactive = (): void => { sweepInactive(db!, mailer, env.PUBLIC_URL!, Date.now()).catch(() => undefined); };
  setInterval(inactive, 24 * 3_600_000).unref();
  setTimeout(inactive, 60_000).unref();
}

const server = buildServer({ shares, accounts: accountsHandler, collab, trustProxy: env.TRUST_PROXY === '1', staticDir: env.STATIC_DIR ? resolve(env.STATIC_DIR) : undefined });
setInterval(() => { void store.sweep(Date.now()); }, 3_600_000).unref();
void store.sweep(Date.now());
server.listen(port, host, () => {
  console.log(`Serveur sur http://${host}:${port} (données : ${dataDir}) — comptes et co-édition : ${accountsHandler ? 'activés' : 'désactivés (PUBLIC_URL absente)'}`);
});
const stop = (): void => { void (collab?.close() ?? Promise.resolve()).then(() => { db?.close(); server.close(); process.exit(0); }); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
