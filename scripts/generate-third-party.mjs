// Génère THIRD_PARTY_NOTICES.md à partir des dépendances de production de l'application web.
// Usage : node scripts/generate-third-party.mjs
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const raw = execSync('pnpm --filter @grafcet/web licenses list --prod --json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const byLicense = JSON.parse(raw.slice(raw.indexOf('{')));
const rows = [];
for (const [license, pkgs] of Object.entries(byLicense)) {
  for (const p of pkgs) rows.push({ name: p.name, version: p.versions.join(', '), license, author: p.author ?? '', homepage: p.homepage ?? '' });
}
rows.sort((a, b) => a.name.localeCompare(b.name));
const counts = {};
for (const r of rows) counts[r.license] = (counts[r.license] ?? 0) + 1;

const md = `# Notices des composants tiers

GRAFCET Studio est distribué sous licence [MPL-2.0](LICENSE). Ci-dessous : les dépendances de production de l'application web (certaines ne sont utilisées qu'à la compilation et ne figurent pas dans le code livré) ;
chacune reste soumise à sa propre licence. Ce fichier est généré par \`node scripts/generate-third-party.mjs\` : ne pas le modifier à la main.

## Polices

Les polices **IBM Plex Sans** et **IBM Plex Mono** (paquets \`@fontsource/ibm-plex-sans\` et \`@fontsource/ibm-plex-mono\`)
sont © 2019 IBM Corp., sous **SIL Open Font License 1.1** (<https://openfontlicense.org>). Elles sont auto-hébergées :
l'application n'appelle aucun service de polices tiers.

## Résumé par licence

${Object.entries(counts).sort().map(([l, n]) => `- ${l} : ${n} composant${n > 1 ? 's' : ''}`).join('\n')}

## Liste des composants

| Composant | Version | Licence | Auteur |
|---|---|---|---|
${rows.map((r) => `| ${r.homepage ? `[${r.name}](${r.homepage})` : r.name} | ${r.version} | ${r.license} | ${r.author.replace(/\|/g, '/')} |`).join('\n')}
`;
writeFileSync('THIRD_PARTY_NOTICES.md', md);
console.log(`THIRD_PARTY_NOTICES.md : ${rows.length} composants`);
