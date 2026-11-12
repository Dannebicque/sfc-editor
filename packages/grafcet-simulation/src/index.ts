import { flatten, isMacro, macrosOf, nodesOf, type FlatGraph, type Grafcet, type Project } from '@grafcet/core';

/** Marquage : ensemble des ids d'étapes actives. */
export type Marking = ReadonlySet<string>;

/** Marquage initial : les étapes initiales. */
export function initialMarking(g: Grafcet): Set<string> {
  const a = new Set<string>();
  for (const it of nodesOf(g)) if (it.kind === 'step' && it.initial) a.add(it.id);
  return a;
}

/**
 * Transitions validables : toutes les étapes amont sont actives.
 * Simulation à jetons : les réceptivités ne sont pas évaluées (prototype, voir ADR).
 */
export function enabledTransitions(flat: FlatGraph, marking: Marking, frozen?: { owner: ReadonlyMap<string, string>; grafcets: ReadonlySet<string> }): Set<string> {
  const preds = new Map<string, string[]>();
  for (const l of flat.links) {
    if (!preds.has(l.to)) preds.set(l.to, []);
    preds.get(l.to)!.push(l.from);
  }
  const en = new Set<string>();
  for (const n of flat.nodes) {
    if (n.kind !== 'trans') continue;
    // Un GRAFCET figé {*} n'évolue plus : aucune de ses transitions n'est franchissable.
    if (frozen && frozen.grafcets.has(frozen.owner.get(n.id) ?? '')) continue;
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
  /** Étape ou transition → GRAFCET auquel elle appartient (les macro-étapes remplacées par leur expansion n'y figurent plus). */
  owner: Map<string, string>;
  /** Étapes initiales de chaque GRAFCET. */
  initialOf: Map<string, string[]>;
}

/** Ordres de forçage IEC 60848 : `G{INIT}`, `G{}`, `G{*}`, `G{X1,X3}`, et la levée d'un figeage. */
export type Forcing =
  | { kind: 'init' }
  | { kind: 'empty' }
  | { kind: 'freeze' }
  | { kind: 'release' }
  | { kind: 'steps'; steps: readonly string[] };

export interface SimState { marking: Set<string>; frozen: Set<string> }

/**
 * Applique un ordre de forçage au GRAFCET `gid` : la situation du seul GRAFCET visé est imposée
 * (les autres ne sont pas touchés) ; figer ne change pas le marquage mais empêche toute évolution.
 * Un forçage de situation prime sur la réceptivité des transitions et ne lève pas un figeage.
 */
export function applyForcing(sim: Simulation, state: SimState, gid: string, f: Forcing): SimState {
  const own = [...sim.owner].filter(([, g]) => g === gid).map(([id]) => id);
  const marking = new Set(state.marking);
  const frozen = new Set(state.frozen);
  if (f.kind === 'freeze') { frozen.add(gid); return { marking, frozen }; }
  if (f.kind === 'release') { frozen.delete(gid); return { marking, frozen }; }
  for (const id of own) marking.delete(id);
  if (f.kind === 'init') for (const id of sim.initialOf.get(gid) ?? []) marking.add(id);
  else if (f.kind === 'steps') for (const id of f.steps) if (sim.owner.get(id) === gid) marking.add(id);
  return { marking, frozen };
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
      for (const it of nodesOf(x)) {
        if (it.kind !== 'step') continue;
        ids.push(it.id);
        if (it.role === 'entry') entry = it.id;
        if (it.role === 'exit') exit = it.id;
      }
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
    for (const it of nodesOf(g)) {
      if (it.kind !== 'step' || !it.initial) continue;
      if (rewire.has(it.id)) initial.add(rewire.get(it.id)!.entry!); else initial.add(it.id);
    }
  }
  const owner = new Map<string, string>();
  const initialOf = new Map<string, string[]>();
  for (const gid of grafcets) {
    const g = P.grafcets.find((x) => x.id === gid)!;
    const ini: string[] = [];
    for (const it of nodesOf(g)) {
      if (!nodes.has(it.id)) continue;
      owner.set(it.id, gid);
      if (it.kind === 'step' && it.initial) ini.push(it.id);
    }
    // Une macro-étape initiale est remplacée par l'étape d'entrée de son expansion.
    for (const it of nodesOf(g)) if (it.kind === 'step' && it.initial && rewire.has(it.id)) ini.push(rewire.get(it.id)!.entry!);
    initialOf.set(gid, ini);
  }
  return { flat: { nodes: [...nodes.values()], links }, initial, members, grafcets, owner, initialOf };
}

/** Une macro-étape est active dès qu'une étape de son expansion l'est. */
export const macroActive = (sim: Simulation, marking: Marking, macroId: string): boolean =>
  (sim.members.get(macroId) ?? []).some((id) => marking.has(id));

export { isMacro };
