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
    if (it.kind === 'trans' && (cites(it.recept) || (it.actions ?? []).some((a) => cites(a.cond)))) out.push(it.id);
    else if (it.kind === 'step' && it.actions.some((a) => (a.kind === 'conditional' || a.kind === 'event') && cites(a.cond))) out.push(it.id);
  });
  return out;
}

export interface SyncLink {
  /** GRAFCET qui teste l'étape. */
  from: string;
  /** Élément (transition ou étape) qui contient la référence. */
  item: string;
  /** Identifiant de l'étape testée. */
  num: string;
  /** GRAFCET qui définissent cette étape (vide : étape inconnue). */
  in: string[];
}

/**
 * Synchronisations entre GRAFCET : références à des étapes définies dans un autre GRAFCET du projet
 * (ou nulle part). Les références à une étape du même GRAFCET ne sont pas des synchronisations.
 */
export function syncLinks(P: { grafcets: Grafcet[] }, known: ReadonlySet<string>): SyncLink[] {
  const defs = new Map<string, string[]>();
  for (const g of P.grafcets) walkAll(g.items, (it) => {
    if (it.kind === 'step') defs.set(it.num, [...(defs.get(it.num) ?? []), g.id]);
  });
  const out: SyncLink[] = [];
  for (const g of P.grafcets) {
    const cite = (item: string, src: string) => {
      if (!src.trim()) return;
      for (const num of parseRecept(src, known).refs) {
        const where = defs.get(num) ?? [];
        if (where.includes(g.id)) continue;
        out.push({ from: g.id, item, num, in: where });
      }
    };
    walkAll(g.items, (it) => {
      if (it.kind === 'trans') cite(it.id, it.recept);
      else if (it.kind === 'step') for (const a of it.actions) if (a.kind === 'conditional' || a.kind === 'event') cite(it.id, a.cond);
    });
  }
  return out;
}
