/**
 * Affichage des réceptivités et conditions d'action : la négation « /x » est dessinée comme dans la norme et les manuels,
 * par une barre au-dessus de l'opérande (« x » surligné) ; « /(a+b) » donne une barre sur tout le groupe, parenthèses
 * comprises. Seul l'affichage change : le texte source (`/x`) reste celui qui est stocké et analysé.
 */
export interface ExprSegment { t: string; over: boolean }

const TIMER = /^(?:t\d*\/X\w+\/\d+(?:[.,]\d+)?\s?(?:ms|s|min)|\d+(?:[.,]\d+)?\s?(?:ms|s|min)\/X\w+)(?![\w])/i;
const IDENT = /^[A-Za-zÀ-ÿ_0-9]+/;

/** Fin (exclue) du groupe qui ouvre en `i` (`(` ou `[`), ou celle du texte si les parenthèses ne sont pas fermées. */
function groupEnd(s: string, i: number): number {
  const open = s[i]!, close = open === '(' ? ')' : ']';
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === open) depth++;
    else if (s[j] === close && --depth === 0) return j + 1;
  }
  return s.length;
}

export function exprSegments(src: string): ExprSegment[] {
  const out: ExprSegment[] = [];
  const push = (t: string, over: boolean): void => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.over === over) last.t += t; else out.push({ t, over });
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const timer = TIMER.exec(rest);
    if (timer) { push(timer[0], false); i += timer[0].length; continue; }
    const c = src[i]!;
    if (c === '/' || c === '!' || c === '¬') {
      let j = i + 1;
      while (src[j] === ' ') j++;
      const o = src[j];
      let end = j;
      if (o === '(' || o === '[') end = groupEnd(src, j);
      else { const m = IDENT.exec(src.slice(j)); end = m ? j + m[0].length : j; }
      if (end > j) { push(src.slice(j, end), true); i = end; continue; }
    }
    push(c, false);
    i++;
  }
  return out;
}

/** Texte tel qu'il apparaît à l'écran (sans les « / » de négation) : sert à mesurer la largeur. */
export const exprDisplay = (src: string): string => exprSegments(src).map((s) => s.t).join('');

/**
 * Coupe une expression trop large en plusieurs lignes, après un « . », un « + », un espace, « ; » ou « , » (jamais au milieu d'un identifiant).
 * Une barre de négation qui est coupée se prolonge sur les deux lignes. `tw` mesure un texte, `max` est la largeur permise
 * (une seule ligne est toujours produite au minimum, même si un terme dépasse `max`).
 */
export function wrapExpr(src: string, tw: (s: string) => number, max: number): ExprSegment[][] {
  const pieces: ExprSegment[] = [];
  for (const s of exprSegments(src)) for (const t of s.t.split(/(?<=[.+;,\s])/)) if (t) pieces.push({ t, over: s.over });
  const lines: ExprSegment[][] = [[]];
  let text = '';
  for (const p of pieces) {
    const cur = lines[lines.length - 1]!;
    if (cur.length && tw(text + p.t) > max) { lines.push([p]); text = p.t; continue; }
    const last = cur[cur.length - 1];
    if (last && last.over === p.over) last.t += p.t; else cur.push({ ...p });
    text += p.t;
  }
  return lines;
}
