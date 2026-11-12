/**
 * Ordres de forçage IEC 60848 écrits dans une action : `G2{INIT}`, `G2{}`, `G2{*}`, `G2{X1,X3}`.
 * Le GRAFCET visé est désigné par son nom ; le contenu des accolades est la situation imposée.
 */
export type ForcingWhat = { kind: 'init' } | { kind: 'empty' } | { kind: 'freeze' } | { kind: 'steps'; steps: string[] };
export interface ForcingOrder { target: string; what: ForcingWhat }

/** Analyse le texte d'une action ; null si ce n'est pas un ordre de forçage. */
export function parseForcingOrder(src: string): ForcingOrder | null {
  const m = /^\s*([^{}\s](?:[^{}]*[^{}\s])?)\s*\{([^{}]*)\}\s*$/.exec(src);
  if (!m) return null;
  const target = m[1]!;
  const body = m[2]!.trim();
  if (!body) return { target, what: { kind: 'empty' } };
  if (body === '*') return { target, what: { kind: 'freeze' } };
  if (/^init$/i.test(body)) return { target, what: { kind: 'init' } };
  const steps = body.split(/[,;]/).map((s) => s.trim());
  if (steps.some((s) => !/^[\wÀ-ÿ]+$/.test(s))) return null;
  return { target, what: { kind: 'steps', steps } };
}

/** Une étape (par son numéro) est désignée avec ou sans le préfixe « X » : `X5` et `5` désignent l'étape 5. */
export const sameStepNum = (num: string, ref: string): boolean => num === ref || num === ref.replace(/^X/i, '');
