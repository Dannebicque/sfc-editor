import type { ActionView, Layout, View } from './layout';

/** Rendu statique d'un GRAFCET en SVG autonome (pour l'export image / PDF) : noir sur blanc, sans élément d'interface. */
export interface SvgOptions {
  /** Marge autour du dessin (px). */
  margin?: number;
  /** Titre (accessibilité : `<title>` du SVG). */
  title?: string;
}
export interface SvgResult { svg: string; width: number; height: number }

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
const INK = '#111', GREY = '#555', COND = '#e9eeed', WARN = '#865600';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number): string => String(Math.round(v * 100) / 100);
const text = (x: number, y: number, s: string, o: { anchor?: 'middle' | 'end'; size?: number; font?: string; fill?: string; style?: string; weight?: number } = {}): string =>
  `<text x="${n(x)}" y="${n(y)}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''} font-family="${o.font ?? MONO}" font-size="${o.size ?? 12.5}"${o.weight ? ` font-weight="${o.weight}"` : ''} fill="${o.fill ?? INK}"${o.style ? ` font-style="${o.style}"` : ''}>${esc(s)}</text>`;
const rect = (x: number, y: number, w: number, h: number, o: { fill?: string; sw?: number; dash?: string; rx?: number } = {}): string =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${o.fill ?? '#fff'}" stroke="${INK}" stroke-width="${o.sw ?? 1.3}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.rx ? ` rx="${o.rx}"` : ''}/>`;
const line = (x1: number, y1: number, x2: number, y2: number, sw: number): string => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${INK}" stroke-width="${sw}"/>`;
const poly = (pts: string): string => `<polygon points="${pts}" fill="${INK}"/>`;

function markPoints(a: ActionView): string {
  const x = a.markCell === 'cond' ? a.x : a.x + a.condW, y = a.y;
  if (a.mark === 'event') return `${x + 3},${y + 11} ${x + 12},${y + 5} ${x + 12},${y + 17}`;
  if (a.mark === 'activation') return `${x + 3},${y + 16} ${x + 13},${y + 16} ${x + 8},${y + 6}`;
  return `${x + 3},${y + 6} ${x + 13},${y + 6} ${x + 8},${y + 16}`;
}

function actions(acts: ActionView[]): string {
  return acts.map((a) => [
    a.cell ? rect(a.x, a.y, a.condW, 22, { fill: COND, dash: '4 2.5' }) : '',
    a.cell ? text(a.x + a.condW / 2 + (a.markCell === 'cond' && a.mark ? 8 : 0), a.y + 15, a.cond || '?', { anchor: 'middle', style: 'italic' }) : '',
    rect(a.x + a.condW, a.y, a.labW, 22),
    a.mark ? poly(markPoints(a)) : '',
    text(a.x + a.condW + 8 + a.labPad, a.y + 15, a.text),
  ].join('')).join('');
}

const arrow = (x: number, y: number): string => poly(`${n(x - 5)},${n(y)} ${n(x + 5)},${n(y)} ${n(x)},${n(y + 9)}`);
const arrivals = (v: { x: number; ay: number; arrivals: string[] }): string =>
  v.arrivals.length ? text(v.x, v.ay + 11, v.arrivals.join(', '), { anchor: 'middle', size: 12, weight: 500 }) + arrow(v.x, v.ay + 13) : '';

function view(v: View): string {
  switch (v.kind) {
    case 'step': return [
      arrivals(v),
      rect(v.x - v.w / 2, v.y, v.w, 40, { sw: 1.6 }),
      v.macro ? line(v.x - v.w / 2, v.y + 8, v.x + v.w / 2, v.y + 8, 1.6) + line(v.x - v.w / 2, v.y + 32, v.x + v.w / 2, v.y + 32, 1.6) : '',
      v.initial ? rect(v.x - v.w / 2 + 4, v.y + 4, v.w - 8, 32, { fill: 'none', sw: 1.2 }) : '',
      text(v.x, v.y + 25, v.num, { anchor: 'middle', size: 14, weight: 500 }),
      v.name ? text(v.x - v.w / 2 - 8, v.y + 24, v.name, { anchor: 'end', size: 12, font: SANS, fill: GREY }) : '',
      actions(v.acts),
    ].join('');
    case 'trans': return [
      arrivals(v),
      line(v.x - 9, v.y + 20, v.x + 9, v.y + 20, 2.6),
      text(v.x - 17, v.y + 24, `(${v.num})`, { anchor: 'end', size: 11, fill: GREY }),
      text(v.x + 17, v.y + 24, v.recept || '?', v.recept ? {} : { fill: WARN, style: 'italic' }),
      actions(v.acts),
    ].join('');
    case 'jump':
      if (v.line) return `<circle cx="${n(v.x)}" cy="${n(v.y + v.h / 2)}" r="3" fill="${INK}"/>`;
      return arrow(v.x, v.y + 22) + text(v.x, v.y + 43, v.label, { anchor: 'middle', size: 12, weight: 500, fill: v.broken ? '#b3261e' : INK });
    case 'seq': return rect(v.x - 15, v.y + 5, 30, 30, { sw: 1.6, dash: '4 3', rx: 4 }) + text(v.x, v.y + 26, 'X', { anchor: 'middle', size: 14, fill: GREY, weight: 600 });
    case 'bar': return v.ys.map((y) => line(v.x1, y, v.x2, y, 1.9)).join('');
  }
}

/** SVG autonome du GRAFCET mis en page (coordonnées du dessin décalées pour tenir dans [marge, marge]). */
export function renderSvg(layout: Layout, opts: SvgOptions = {}): SvgResult {
  const m = opts.margin ?? 20, b = layout.bounds;
  const width = Math.ceil(Math.max(b.w, 40) + 2 * m), height = Math.ceil(Math.max(b.h, 40) + 2 * m);
  const body = layout.lines.map((l) => line(l.x1, l.y1, l.x2, l.y2, 1.5)).join('') + layout.views.map(view).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"${opts.title ? ` aria-label="${esc(opts.title)}"` : ''}>`
    + (opts.title ? `<title>${esc(opts.title)}</title>` : '')
    + `<rect width="${width}" height="${height}" fill="#fff"/>`
    + `<g transform="translate(${n(m - b.x)},${n(m - b.y)})">${body}</g></svg>`;
  return { svg, width, height };
}
