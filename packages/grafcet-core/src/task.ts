import { flatten, nodesOf } from './graph';
import { parseRecept } from './recept';
import type { Project } from './types';

/**
 * Étapes-tâches (type « task » de SFCEdit). Une étape-tâche déclenche un GRAFCET partiel : le GRAFCET « exécutant » est
 * celui dont la première transition (celle qui suit son étape initiale) teste l'étape-tâche (« XT4A+XT4B+XT4C » dans GT4).
 * Le lien est déduit des réceptivités, comme les autres synchronisations entre GRAFCET : rien de plus n'est stocké.
 */
export interface TaskLink {
  /** GRAFCET qui contient l'étape-tâche. */
  gid: string;
  stepId: string;
  num: string;
  /** GRAFCET exécutant la tâche. */
  runner: string;
}

export function taskLinks(P: Project): TaskLink[] {
  const known = new Set<string>();
  for (const g of P.grafcets) for (const it of nodesOf(g)) if (it.kind === 'step') known.add(it.num);
  /** GRAFCET → numéros d'étapes testés par ses transitions de démarrage. */
  const starts = new Map<string, Set<string>>();
  for (const g of P.grafcets) {
    const initial = new Set(nodesOf(g).filter((n) => n.kind === 'step' && n.initial).map((n) => n.id));
    const first = new Set(flatten(g).links.filter((l) => initial.has(l.from)).map((l) => l.to));
    const refs = new Set<string>();
    for (const it of nodesOf(g)) if (it.kind === 'trans' && first.has(it.id) && it.recept.trim()) for (const r of parseRecept(it.recept, known).refs) refs.add(r);
    starts.set(g.id, refs);
  }
  const out: TaskLink[] = [];
  for (const g of P.grafcets) for (const it of nodesOf(g)) {
    if (it.kind !== 'step' || !it.task) continue;
    for (const h of P.grafcets) if (h.id !== g.id && starts.get(h.id)!.has(it.num)) out.push({ gid: g.id, stepId: it.id, num: it.num, runner: h.id });
  }
  return out;
}
