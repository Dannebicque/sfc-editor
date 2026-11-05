import { flatten, isMacro, macrosOf, walkAll, type FlatGraph, type Grafcet, type Project } from '@grafcet/core';

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
    // Une transition source (sans étape amont) est toujours validable ; sa réceptivité seule décide.
    if (p.every((x) => marking.has(x))) en.add(n.id);
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

export interface Simulation {
  /** Graphe de simulation : le GRAFCET racine et, récursivement, les expansions de ses macro-étapes. */
  flat: FlatGraph;
  /** Marquage initial. */
  initial: Set<string>;
  /** Pour chaque macro-étape : les étapes de son expansion (la macro est active dès qu'une d'elles l'est). */
  members: Map<string, string[]>;
  /** GRAFCET inclus dans la simulation. */
  grafcets: Set<string>;
}

/**
 * Simulation à jetons d'un GRAFCET avec ses macro-étapes : une liaison vers une macro-étape devient une liaison vers
 * l'étape d'entrée de son expansion, et une liaison depuis la macro-étape part de l'étape de sortie.
 * Une macro-étape sans expansion exploitable reste une étape ordinaire.
 */
export function buildSimulation(P: Project, rootId: string): Simulation {
  const nodes = new Map<string, FlatGraph['nodes'][number]>();
  let links: FlatGraph['links'] = [];
  const members = new Map<string, string[]>();
  const grafcets = new Set<string>();
  const initial = new Set<string>();
  const rewire = new Map<string, { entry?: string; exit?: string }>();

  function include(g: Grafcet): void {
    if (grafcets.has(g.id)) return;
    grafcets.add(g.id);
    const fg = flatten(g);
    for (const n of fg.nodes) nodes.set(n.id, n);
    links.push(...fg.links);
    for (const m of macrosOf(g)) {
      const x = typeof m.expansion === 'string' ? P.grafcets.find((y) => y.id === m.expansion) : undefined;
      if (!x) continue;
      include(x);
      const ids: string[] = [];
      let entry: string | undefined, exit: string | undefined;
      walkAll(x.items, (it) => {
        if (it.kind !== 'step') return;
        ids.push(it.id);
        if (it.role === 'entry') entry = it.id;
        if (it.role === 'exit') exit = it.id;
      });
      if (entry && exit) { members.set(m.id, ids); rewire.set(m.id, { entry, exit }); }
    }
  }
  const root = P.grafcets.find((g) => g.id === rootId) ?? P.grafcets[0]!;
  include(root);
  for (const m of rewire.keys()) nodes.delete(m);
  links = links.map((l) => ({
    ...l,
    from: rewire.get(l.from)?.exit ?? l.from,
    to: rewire.get(l.to)?.entry ?? l.to,
  }));
  for (const gid of grafcets) {
    const g = P.grafcets.find((x) => x.id === gid)!;
    walkAll(g.items, (it) => {
      if (it.kind !== 'step' || !it.initial) return;
      if (rewire.has(it.id)) initial.add(rewire.get(it.id)!.entry!); else initial.add(it.id);
    });
  }
  return { flat: { nodes: [...nodes.values()], links }, initial, members, grafcets };
}

/** Une macro-étape est active dès qu'une étape de son expansion l'est. */
export const macroActive = (sim: Simulation, marking: Marking, macroId: string): boolean =>
  (sim.members.get(macroId) ?? []).some((id) => marking.has(id));

export { isMacro };
