import { flatten, walkAll, type FlatGraph, type Grafcet } from '@grafcet/core';

/** Marquage : ensemble des ids d'étapes actives. */
export type Marking = ReadonlySet<string>;

/** Marquage initial : les étapes initiales. */
export function initialMarking(g: Grafcet): Set<string> {
  const a = new Set<string>();
  walkAll(g.items, (it) => { if (it.kind === 'step' && it.initial) a.add(it.id); });
  return a;
}

/**
 * Transitions validables : toutes les étapes amont sont actives.
 * Simulation à jetons : les réceptivités ne sont pas évaluées (prototype, voir ADR).
 */
export function enabledTransitions(flat: FlatGraph, marking: Marking): Set<string> {
  const preds = new Map<string, string[]>();
  for (const l of flat.links) {
    if (!preds.has(l.to)) preds.set(l.to, []);
    preds.get(l.to)!.push(l.from);
  }
  const en = new Set<string>();
  for (const n of flat.nodes) {
    if (n.kind !== 'trans') continue;
    const p = preds.get(n.id) ?? [];
    if (p.length && p.every((x) => marking.has(x))) en.add(n.id);
  }
  return en;
}

/** Franchit la transition `tid` : désactive les étapes amont, active les étapes aval. */
export function fire(flat: FlatGraph, marking: Marking, tid: string): Set<string> {
  const next = new Set(marking);
  for (const l of flat.links) if (l.to === tid) next.delete(l.from);
  for (const l of flat.links) if (l.from === tid) next.add(l.to);
  return next;
}

export { flatten };
