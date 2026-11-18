import type { Plugin } from 'vite';
import { renderHead, renderLanding } from './render';

/** Adresse publique de l'instance (VITE_SITE_URL, sans barre finale) : sans elle, pas de canonical ni de sitemap. */
const site = (process.env.VITE_SITE_URL ?? '').trim().replace(/\/+$/, '');

/** Génère les deux pages de la landing (/ en français, /en/ en anglais) à partir de `content.ts`, en développement comme en build. */
export function landingPlugin(): Plugin {
  return {
    name: 'sfc-landing',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!ctx.filename.endsWith('index.html') || ctx.filename.includes('/app/')) return html;
        const lang = ctx.filename.includes('/en/') ? 'en' : 'fr';
        return html.replace('<!--head-->', renderHead(lang, /^https?:\/\//.test(site) ? site : '')).replace('<!--landing-->', renderLanding(lang));
      },
    },
    generateBundle() {
      const ok = /^https?:\/\//.test(site);
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nDisallow: /api/\nDisallow: /ws/\n${ok ? `Sitemap: ${site}/sitemap.xml\n` : ''}` });
      if (ok) {
        const url = (p: string): string => `  <url><loc>${site}${p}</loc><xhtml:link rel="alternate" hreflang="fr" href="${site}/"/><xhtml:link rel="alternate" hreflang="en" href="${site}/en/"/></url>`;
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${url('/')}\n${url('/en/')}\n</urlset>\n` });
      }
    },
  };
}
