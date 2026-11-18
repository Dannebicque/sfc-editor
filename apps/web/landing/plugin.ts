import type { Plugin } from 'vite';
import { renderHead, renderLanding } from './render';

/** Génère les deux pages de la landing (/ en français, /en/ en anglais) à partir de `content.ts`, en développement comme en build. */
export function landingPlugin(): Plugin {
  return {
    name: 'sfc-landing',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!ctx.filename.endsWith('index.html') || ctx.filename.includes('/app/')) return html;
        const lang = ctx.filename.includes('/en/') ? 'en' : 'fr';
        return html.replace('<!--head-->', renderHead(lang)).replace('<!--landing-->', renderLanding(lang));
      },
    },
  };
}
