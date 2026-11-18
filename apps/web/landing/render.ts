import { CONTENT, type Content, type Lang } from './content';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Dessin d'illustration (SVG en ligne, couleurs par variables CSS : suit le thème clair/sombre). */
function figure(label: string): string {
  const box = (x: number, y: number, n: string, init = false): string =>
    `<rect x="${x}" y="${y}" width="44" height="44" class="shape"/>${init ? `<rect x="${x + 5}" y="${y + 5}" width="34" height="34" class="shape"/>` : ''}<text x="${x + 22}" y="${y + 28}" class="num" text-anchor="middle">${n}</text>`;
  const bar = (x: number, y: number, t: string): string => `<path d="M${x - 14} ${y}h28" class="shape thick"/><text x="${x + 22}" y="${y + 4}" class="lab">${t}</text>`;
  const act = (x: number, y: number, t: string): string => `<path d="M${x} ${y + 22}h18" class="shape"/><rect x="${x + 18}" y="${y + 10}" width="64" height="24" class="shape"/><text x="${x + 50}" y="${y + 27}" class="lab" text-anchor="middle">${t}</text>`;
  return `<svg viewBox="0 0 320 470" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">
<g fill="none">
${box(130, 12, '1', true)}${act(174, 12, 'KM1')}
<path d="M152 56v34" class="shape"/>${bar(152, 90, 'a')}<path d="M152 90v34" class="shape"/>
${box(130, 124, '2')}${act(174, 124, 'KM2')}
<path d="M152 168v34" class="shape"/>${bar(152, 202, 'b')}<path d="M152 202v18" class="shape"/>
<path d="M62 220h180M62 225h180" class="shape"/>
<path d="M100 225v25M204 225v25" class="shape"/>
${box(78, 250, '3')}${box(182, 250, '4')}
<path d="M100 294v34M204 294v34" class="shape"/>
<path d="M86 328h28M190 328h28" class="shape thick"/><text x="122" y="332" class="lab">c</text><text x="226" y="332" class="lab">d</text>
<path d="M100 328v28M204 328v28" class="shape"/>
<path d="M62 356h180M62 361h180" class="shape"/>
<path d="M152 361v24" class="shape"/>${bar(152, 385, 't/10s')}<path d="M152 385v30" class="shape"/>
<path d="M152 415v22" class="shape"/><path d="M146 430l6 8 6-8" class="shape"/><text x="152" y="458" class="num" text-anchor="middle">1</text>
</g></svg>`;
}

const ctaAttrs = (c: Content): string => `data-cta data-event="landing_try" data-resume="${esc(c.cta.resume)}"`;

export function renderLanding(lang: Lang): string {
  const c = CONTENT[lang];
  const tryBtn = (cls: string): string => `<a class="btn ${cls}" href="/app/" ${ctaAttrs(c)}>${c.cta.try}</a>`;
  const w = c.plans.waitlist;
  const waitlist = (): string => `
        <form class="wait" data-waitlist data-lang="${lang}" novalidate aria-labelledby="wait-t">
          <h4 id="wait-t">${w.title}</h4>
          <label for="wait-email">${w.email}</label>
          <input id="wait-email" name="email" type="email" autocomplete="email" required maxlength="254" />
          <label for="wait-kind">${w.kind}</label>
          <select id="wait-kind" name="kind"><option value="teacher">${w.kinds.teacher}</option><option value="school">${w.kinds.school}</option><option value="other">${w.kinds.other}</option></select>
          <label class="check"><input type="checkbox" name="consent" required /> <span>${w.consent}</span></label>
          <button class="btn primary" type="submit">${w.submit}</button>
          <p class="wait-msg" role="status" data-ok="${esc(w.ok)}" data-invalid="${esc(w.invalid)}" data-error="${esc(w.error)}" data-rate="${esc(w.rate)}"></p>
        </form>`;
  const plan = (p: Content['plans']['items'][number]): string => `
      <li class="plan ${p.id === 'free' ? 'plan-hl' : ''} ${p.id === 'paid' ? 'plan-soon' : ''}">
        <p class="tag">${p.tag}</p>
        <h3>${p.name}</h3>
        <p>${p.text}</p>
        <ul class="points">${p.points.map((x) => `<li>${x}</li>`).join('')}</ul>
        ${p.cta && p.href ? `<a class="btn ${p.id === 'free' ? 'primary' : 'ghost'}" href="${p.href}" data-cta data-event="${p.id === 'free' ? 'landing_account' : 'landing_try'}">${p.cta}</a>` : ''}
        ${p.id === 'paid' ? waitlist() : ''}
      </li>`;
  return `
<a class="skip" href="#main">${c.skip}</a>
<header class="top">
  <div class="wrap bar">
    <a class="brand" href="${c.path}" aria-label="SFC Editor">
      <span class="logo" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="1.5" width="6" height="4"/><path d="M8 5.5v2.2M5.8 7.7h4.4M8 7.7v1.6"/><rect x="5" y="9.3" width="6" height="4"/></svg></span>
      <span class="name">SFC Editor</span>
    </a>
    <nav aria-label="${lang === 'fr' ? 'Sections' : 'Sections'}" class="nav">
      <a href="#features">${c.nav.features}</a><a href="#plans">${c.nav.plans}</a><a href="#faq">${c.nav.faq}</a>
    </nav>
    <a class="lang" href="${c.altPath}" hreflang="${lang === 'fr' ? 'en' : 'fr'}" lang="${lang === 'fr' ? 'en' : 'fr'}" title="${esc(c.langSwitch.title)}">${c.langSwitch.label}</a>
    ${tryBtn('primary small')}
  </div>
</header>
<main id="main">
  <section class="hero wrap" aria-labelledby="h-hero">
    <div class="hero-text">
      <p class="kicker">${c.hero.kicker}</p>
      <h1 id="h-hero">${c.hero.title}</h1>
      <p class="lead">${c.hero.lead}</p>
      <p class="cta-row">${tryBtn('primary big')}<a class="btn ghost big" href="/app/#/register" data-cta data-event="landing_account">${c.cta.account}</a></p>
      <p class="note">${c.hero.note}</p>
    </div>
    <div class="hero-fig">${figure(c.hero.figure)}</div>
  </section>

  <section class="wrap sec shot" aria-labelledby="h-shot">
    <h2 id="h-shot">${c.preview.title}</h2>
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="/shots/editor-${lang}-dark.jpg" />
      <img src="/shots/editor-${lang}-light.jpg" width="800" height="500" loading="lazy" alt="${esc(c.preview.alt)}" />
    </picture>
  </section>

  <section id="features" class="wrap sec" aria-labelledby="h-feat">
    <h2 id="h-feat">${c.features.title}</h2>
    <p class="sec-lead">${c.features.lead}</p>
    <ul class="grid">${c.features.items.map((f) => `<li class="card"><h3>${f.title}</h3><p>${f.text}</p></li>`).join('')}</ul>
  </section>

  <section class="alt"><div class="wrap sec" aria-labelledby="h-aud">
    <h2 id="h-aud">${c.audience.title}</h2>
    <ul class="grid g3">${c.audience.items.map((f) => `<li class="card"><h3>${f.title}</h3><p>${f.text}</p></li>`).join('')}</ul>
  </div></section>

  <section id="plans" class="wrap sec" aria-labelledby="h-plans">
    <h2 id="h-plans">${c.plans.title}</h2>
    <p class="sec-lead">${c.plans.lead}</p>
    <ul class="plans">${c.plans.items.map(plan).join('')}</ul>
    <p class="fine">${c.plans.foot}</p>
  </section>

  <section id="faq" class="alt"><div class="wrap sec narrow" aria-labelledby="h-faq">
    <h2 id="h-faq">${c.faq.title}</h2>
    ${c.faq.items.map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join('')}
  </div></section>

  <section class="wrap sec final" aria-labelledby="h-final">
    <h2 id="h-final">${c.final.title}</h2>
    <p class="sec-lead">${c.final.text}</p>
    <p class="cta-row center">${tryBtn('primary big')}</p>
  </section>
</main>
<footer class="foot"><div class="wrap">
  <p>SFC Editor · ${c.footer.license}</p>
  <nav aria-label="Legal"><a href="/app/#/legal/mentions">${c.footer.legal}</a><a href="/app/#/legal/privacy">${c.footer.privacy}</a><a href="/app/#/legal/terms">${c.footer.terms}</a></nav>
</div></footer>`;
}

/** `site` : adresse publique (sans barre finale), pour canonical, hreflang et Open Graph ; absente en développement. */
export function renderHead(lang: Lang, site = ''): string {
  const c = CONTENT[lang];
  const alt = site ? `
    <link rel="canonical" href="${site}${c.path}" />
    <link rel="alternate" hreflang="fr" href="${site}/" />
    <link rel="alternate" hreflang="en" href="${site}/en/" />
    <link rel="alternate" hreflang="x-default" href="${site}/" />
    <meta property="og:url" content="${site}${c.path}" />
    <meta property="og:locale" content="${lang === 'fr' ? 'fr_FR' : 'en_GB'}" />` : '';
  return `<title>${esc(c.title)}</title>
    <meta name="description" content="${esc(c.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(c.title)}" />
    <meta property="og:description" content="${esc(c.description)}" />${alt}`;
}
