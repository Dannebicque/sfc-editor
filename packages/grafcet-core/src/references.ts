import type { Grafcet } from './types';
import { parseRecept } from './recept';
import { walkAll } from './tree';

/**
 * Éléments d'un GRAFCET qui testent l'étape d'identifiant `num` (« X13 », « INIT », temporisations…) :
 * transitions (réceptivité) et étapes dont une action conditionnelle cite l'étape.
 * `known` : identifiants d'étapes de tout le projet (voir `parseRecept`).
 */
export function referencesTo(g: Grafcet, num: string, known: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const cites = (src: string) => !!src.trim() && parseRecept(src, known).refs.includes(num);
  walkAll(g.items, (it) => {
    if (it.kind === 'trans' && cites(it.recept)) out.push(it.id);
    else if (it.kind === 'step' && it.actions.some((a) => (a.kind === 'conditional' || a.kind === 'event') && cites(a.cond))) out.push(it.id);
  });
  return out;
}
