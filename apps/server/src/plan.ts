import { openDb } from './db';

// Usage : pnpm --filter @grafcet/server plan <email> <free|teacher>   (lit DB_PATH, ou $DATA_DIR/app.db)
// En attendant le paiement en ligne : l'offre « classe » s'attribue à la main.
const [email, plan] = [process.argv[2]?.trim().toLowerCase(), process.argv[3]];
if (!email || (plan !== 'free' && plan !== 'teacher')) { console.error('Usage : plan <email> <free|teacher>'); process.exit(1); }
const dataDir = process.env.DATA_DIR ?? './data';
const r = openDb(process.env.DB_PATH ?? dataDir + '/app.db').prepare('UPDATE users SET plan = ? WHERE email = ?').run(plan, email);
console.log(Number(r.changes) ? `${email} : offre « ${plan} ».` : `Aucun compte pour ${email}.`);
process.exit(Number(r.changes) ? 0 : 2);
