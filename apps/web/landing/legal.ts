import { en } from '../../../packages/editor/src/legal/en.ts';
import { fr } from '../../../packages/editor/src/legal/fr.ts';
import { LEGAL } from '../../../packages/editor/src/legal/config.ts';
import { expand } from '../../../packages/editor/src/legal/render.ts';
import type { LegalBlock } from '../../../packages/editor/src/legal/types.ts';
import { CONTENT, type Lang } from './content.ts';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Les liens relatifs des textes (./licenses/…) sont relatifs à l'éditeur : sur ce site, ils partent de la racine.
const fixHref = (h: string): string => (h.startsWith('./') ? h.slice(1) : h);

/** Texte avec jetons : les valeurs renseignées sont échappées, les champs vides apparaissent en évidence (jamais inventés). */
function text(t: string, todo: string): string {
  return expand(t, LEGAL, todo).map((s) => (typeof s === 'string' ? esc(s) : `<mark class="todo">${esc(s.todo)}</mark>`)).join('');
}

function block(b: LegalBlock, title: string, todo: string): string {
  if ('h' in b) return `<h3>${esc(b.h)}</h3>`;
  if ('p' in b) return `<p>${text(b.p, todo)}</p>`;
  if ('ul' in b) return `<ul>${b.ul.map((x) => `<li>${text(x, todo)}</li>`).join('')}</ul>`;
  if ('table' in b) {
    return `<div class="legal-table" tabindex="0" role="region" aria-label="${esc(title)}"><table><thead><tr>${b.table.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  const href = fixHref(expand(b.a.href, LEGAL, '').map((s) => (typeof s === 'string' ? s : '')).join(''));
  return `<p><a href="${esc(href)}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(b.a.label)}</a></p>`;
}

/** Page « Informations légales » de la landing : les mêmes textes que le dialogue de l'éditeur, sans ouvrir l'éditeur. */
export function renderLegal(lang: Lang): string {
  const c = CONTENT[lang];
  const docs = lang === 'fr' ? fr : en;
  return `
<a class="skip" href="#main">${c.skip}</a>
<header class="top">
  <div class="wrap bar">
    <a class="brand" href="${c.path}" aria-label="SFC Editor"><span class="logo" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="1.5" width="6" height="4"/><path d="M8 5.5v2.2M5.8 7.7h4.4M8 7.7v1.6"/><rect x="5" y="9.3" width="6" height="4"/></svg></span><span class="name">SFC Editor</span></a>
    <a class="nav-back" href="${c.path}">${c.legalPage.back}</a>
    <a class="lang" href="${c.altLegalPath}" hreflang="${lang === 'fr' ? 'en' : 'fr'}" lang="${lang === 'fr' ? 'en' : 'fr'}" title="${esc(c.langSwitch.title)}">${c.langSwitch.label}</a>
  </div>
</header>
<main id="main" class="wrap legal-page">
  <h1>${esc(lang === 'fr' ? 'Informations légales' : 'Legal information')}</h1>
  <p class="note">${c.legalPage.updated} : ${esc(LEGAL.updated)}</p>
  <nav aria-label="${esc(c.legalPage.navAria)}" class="legal-nav"><ul>${docs.map((d) => `<li><a href="#${d.id}">${esc(d.title)}</a></li>`).join('')}</ul></nav>
  ${docs.map((d) => `<article id="${d.id}" lang="${lang}" aria-labelledby="t-${d.id}"><h2 id="t-${d.id}">${esc(d.title)}</h2>${d.blocks.map((b) => block(b, d.title, c.legalPage.todo)).join('')}</article>`).join('')}
</main>
<footer class="foot"><div class="wrap"><p>SFC Editor · ${c.footer.license}</p><nav aria-label="Legal"><a href="${c.path}">${c.legalPage.back}</a></nav></div></footer>`;
}

export function renderLegalHead(lang: Lang, site = ''): string {
  const c = CONTENT[lang];
  const alt = site ? `\n    <link rel="canonical" href="${site}${c.legalPath}" />\n    <link rel="alternate" hreflang="fr" href="${site}/legal/" />\n    <link rel="alternate" hreflang="en" href="${site}/en/legal/" />` : '';
  return `<title>${esc(c.legalPage.title)}</title>
    <meta name="description" content="${esc(c.legalPage.description)}" />${alt}`;
}
