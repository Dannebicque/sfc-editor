/**
 * Contrôle d'un export XML de SFCEdit : importe le fichier et compare le réseau obtenu à celui du XML.
 * Usage : pnpm check:sfcedit <fichier.xml>   (code de sortie 1 si une différence est trouvée)
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { checkSfcEditImport, importSfcEditXml } from '../packages/grafcet-io/src';

const file = process.argv[2];
if (!file) { console.error('Usage : pnpm check:sfcedit <fichier.xml>'); process.exit(2); }
const xml = readFileSync(file, 'utf8');
const { model, report } = importSfcEditXml(xml, { projectName: basename(file, '.xml') });
const results = checkSfcEditImport(xml, model);
let bad = 0;
for (const r of results) {
  console.log(`${r.ok ? '✔' : '✘'} ${r.grafcet} — ${r.steps} étapes, ${r.transitions} transitions`);
  for (const d of r.diffs) console.log('    ' + d);
  if (!r.ok) bad++;
}
const errs = report.entries.filter((e) => e.level === 'error');
if (errs.length) console.log(`\n${errs.length} erreur(s) d'import :`, errs.map((e) => e.message.key).join(', '));
console.log(bad || errs.length ? `\n${bad} GRAFCET différent(s).` : `\nImport conforme au XML (${results.length} GRAFCET).`);
process.exit(bad || errs.length ? 1 : 0);
