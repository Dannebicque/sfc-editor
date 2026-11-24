import { openDb } from './db';
import { stats } from './usage';

// Usage : pnpm --filter @grafcet/server stats [jours]   (lit DB_PATH, ou $DATA_DIR/app.db)
const dataDir = process.env.DATA_DIR ?? './data';
const days = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 30;
const s = stats(openDb(process.env.DB_PATH ?? dataDir + '/app.db'), Date.now(), days);
console.log(`Événements depuis le ${s.since} (${days} jours) :`);
for (const [k, v] of Object.entries(s.events)) console.log(`  ${k.padEnd(18)} ${v}`);
console.log('Liste d\'attente :', Object.keys(s.waitlist).length ? JSON.stringify(s.waitlist) : 'vide');
