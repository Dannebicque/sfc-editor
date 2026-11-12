import type { Grafcet, HLink, Jump, Node, Seq } from './types';

/** Index de lecture d'un GRAFCET (à recalculer après toute modification). */
export interface GraphIndex {
  seq: Map<string, Seq>;
  link: Map<string, HLink>;
  jump: Map<string, Jump>;
  /** Élément (étape/transition) → séquence et position. */
  node: Map<string, { seq: Seq; idx: number; item: Node }>;
  /** Séquence → lien dont elle est branche de divergence (début utilisé) ou base de convergence (début utilisé). */
  startUse: Map<string, { link: HLink; role: 'child' | 'base' }>;
  /** Séquence → lien dont elle est base de divergence ou branche de convergence (fin utilisée), ou renvoi qui en part. */
  endUse: Map<string, { link: HLink; role: 'base' | 'node' } | { jump: Jump }>;
}

export function indexOf(g: Grafcet): GraphIndex {
  const ix: GraphIndex = { seq: new Map(), link: new Map(), jump: new Map(), node: new Map(), startUse: new Map(), endUse: new Map() };
  for (const s of g.seqs) {
    ix.seq.set(s.id, s);
    s.items.forEach((item, idx) => ix.node.set(item.id, { seq: s, idx, item }));
  }
  for (const l of g.links) {
    ix.link.set(l.id, l);
    if (l.kind === 'div') {
      if (l.base) ix.endUse.set(l.base, { link: l, role: 'base' });
      for (const n of l.nodes) ix.startUse.set(n, { link: l, role: 'child' });
    } else {
      if (l.base) ix.startUse.set(l.base, { link: l, role: 'base' });
      for (const n of l.nodes) ix.endUse.set(n, { link: l, role: 'node' });
    }
  }
  for (const j of g.jumps) { ix.jump.set(j.id, j); ix.endUse.set(j.from, { jump: j }); }
  return ix;
}

/** Toutes les étapes et transitions, séquence après séquence. */
export function nodesOf(g: Grafcet): Node[] {
  const out: Node[] = [];
  for (const s of g.seqs) out.push(...s.items);
  return out;
}
export const stepsOf = (g: Grafcet) => nodesOf(g).filter((n): n is Extract<Node, { kind: 'step' }> => n.kind === 'step');
export const findNode = (g: Grafcet, id: string): Node | null => {
  for (const s of g.seqs) for (const it of s.items) if (it.id === id) return it;
  return null;
};
export const seqContaining = (g: Grafcet, id: string): Seq | null => g.seqs.find((s) => s.items.some((i) => i.id === id)) ?? null;
export const first = (s: Seq | undefined | null): Node | undefined => s?.items[0];
export const last = (s: Seq | undefined | null): Node | undefined => s?.items[s.items.length - 1];

/** Type de l'élément qui peut précéder / suivre : une étape est suivie d'une transition et inversement. */
const other = (k: Node['kind']): Node['kind'] => (k === 'step' ? 'trans' : 'step');
export { other as alternate };

/**
 * Règles de structure : renvoie null si le GRAFCET est cohérent, sinon la clé du message d'erreur.
 *  - étapes et transitions alternent dans chaque séquence ;
 *  - divergence OU : base finie par une étape, branches commençant par une transition (ET : transition puis étapes) ;
 *  - convergence OU : branches finies par une transition, base commençant par une étape (ET : étapes puis transition) ;
 *  - une fin de séquence n'est utilisée qu'une fois (base de divergence, branche de convergence ou renvoi), un début aussi ;
 *  - le graphe des liens n'a pas de cycle ; un lien a au moins deux branches.
 */
/** Une séquence est branche d'une divergence ET (sa tête est alors une étape). */
export const isAndBranch = (g: Grafcet, seqId: string): boolean => g.links.some((l) => l.kind === 'div' && l.op === 'and' && l.nodes.includes(seqId));

export interface Violation { key: string; id: string }

/** Toutes les violations structurelles (clé de message + identifiant concerné). Vide = graphe valide. */
export function violations(g: Grafcet): Violation[] {
  const out: Violation[] = [];
  const bad = (key: string, id = ''): void => { out.push({ key, id }); };
  const ix = indexOf(g);
  if (ix.seq.size !== g.seqs.length) bad('chk_dup');
  const ids = new Set<string>();
  for (const s of g.seqs) for (let i = 0; i < s.items.length; i++) {
    const it = s.items[i]!;
    if (ids.has(it.id)) bad('chk_dup', it.id);
    ids.add(it.id);
    if (i > 0 && s.items[i - 1]!.kind === it.kind) bad('chk_alternation', it.id);
  }
  const startUsed = new Set<string>(), endUsed = new Set<string>();
  const kindIf = (s: Seq | undefined, which: 'first' | 'last', k: Node['kind']) => { const n = which === 'first' ? first(s) : last(s); return !n || n.kind === k; };
  for (const l of g.links) {
    if (l.nodes.length < 2) bad('chk_min_branches', l.id);
    if (new Set(l.nodes).size !== l.nodes.length) bad('chk_dup', l.id);
    const base = l.base ? ix.seq.get(l.base) : undefined;
    if (l.base && !base) { bad('chk_ref', l.id); continue; }
    if (l.nodes.some((n) => !ix.seq.has(n)) || (l.base && l.nodes.includes(l.base))) { bad('chk_ref', l.id); continue; }
    const or = l.op === 'or';
    if (l.kind === 'div') {
      if (base) {
        if (endUsed.has(base.id)) bad('chk_end_used', base.id);
        endUsed.add(base.id);
        if (!kindIf(base, 'last', or ? 'step' : 'trans')) bad(or ? 'chk_div_or_base' : 'chk_div_and_base', l.id);
      }
      for (const n of l.nodes) {
        if (startUsed.has(n)) bad('chk_start_used', n);
        startUsed.add(n);
        if (!kindIf(ix.seq.get(n), 'first', or ? 'trans' : 'step')) bad(or ? 'chk_start_or' : 'chk_start_and', n);
      }
    } else {
      for (const n of l.nodes) {
        if (endUsed.has(n)) bad('chk_end_used', n);
        endUsed.add(n);
        if (!kindIf(ix.seq.get(n), 'last', or ? 'trans' : 'step')) bad(or ? 'chk_conv_or_end' : 'chk_conv_and_end', n);
      }
      if (base) {
        if (startUsed.has(base.id)) bad('chk_start_used', base.id);
        startUsed.add(base.id);
        if (!kindIf(base, 'first', or ? 'step' : 'trans')) bad(or ? 'chk_conv_or_base' : 'chk_conv_and_base', l.id);
      }
    }
  }
  for (const j of g.jumps) {
    const s = ix.seq.get(j.from);
    // Un renvoi part de la fin d'une séquence, ou d'une branche vide de divergence ET (la barre arrive alors directement sur l'étape cible).
    const andBranch = !!s && !s.items.length && isAndBranch(g, s.id);
    if (!s || (!s.items.length && !andBranch)) { bad('chk_jump_from', j.id); continue; }
    if (endUsed.has(j.from)) bad('chk_end_used', j.from);
    endUsed.add(j.from);
    if (j.to !== null) {
      const t = ix.node.get(j.to);
      if (!t) bad('chk_ref', j.id);
      else if (t.item.kind === (andBranch ? 'trans' : last(s)!.kind)) bad('chk_jump_kind', j.id);
    }
  }
  // Pas de cycle dans le graphe des liens (une boucle se fait avec un renvoi).
  const succ = new Map<string, string[]>();
  const edge = (a: string, b: string) => { const x = succ.get(a) ?? []; x.push(b); succ.set(a, x); };
  for (const l of g.links) {
    if (l.kind === 'div') { if (l.base) for (const n of l.nodes) edge(l.base, n); } else if (l.base) for (const n of l.nodes) edge(n, l.base);
  }
  const state = new Map<string, 1 | 2>();
  const dfs = (a: string): boolean => {
    if (state.get(a) === 2) return false;
    if (state.get(a) === 1) return true;
    state.set(a, 1);
    for (const b of succ.get(a) ?? []) if (dfs(b)) return true;
    state.set(a, 2);
    return false;
  };
  for (const s of g.seqs) if (dfs(s.id)) { bad('chk_cycle', s.id); break; }
  return out;
}

/** Première violation (clé de message), ou null si le graphe est valide. */
export function checkGraph(g: Grafcet): string | null {
  return violations(g)[0]?.key ?? null;
}

/**
 * Séquences dans l'ordre du document (de haut en bas) : séquences de tête, puis leurs divergences, une base de
 * convergence suivant toutes ses branches. Sert à numéroter, à lister et à parcourir au clavier.
 */
export function docOrder(g: Grafcet): Seq[] {
  const ix = indexOf(g);
  const out: Seq[] = [], seen = new Set<string>();
  const visit = (s: Seq): void => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    out.push(s);
    const e = ix.endUse.get(s.id);
    if (!e) return;
    if ('jump' in e) return;
    if (e.role === 'base') { for (const n of e.link.nodes) { const c = ix.seq.get(n); if (c) visit(c); } return; }
    const l = e.link;
    if (l.base && l.nodes.every((n) => seen.has(n))) { const b = ix.seq.get(l.base); if (b) visit(b); }
  };
  for (const s of g.seqs) if (!ix.startUse.has(s.id)) visit(s);
  for (const s of g.seqs) visit(s);
  return out;
}

export interface FlatNode { id: string; kind: 'step' | 'trans'; num: string | number }
export interface FlatLink { from: string; to: string; jump?: true }
export interface FlatGraph { nodes: FlatNode[]; links: FlatLink[] }

/** Graphe plat (étapes/transitions et liaisons) dérivé des séquences, des liens et des renvois. */
export function flatten(g: Grafcet): FlatGraph {
  const ix = indexOf(g);
  const nodes: FlatNode[] = [], links: FlatLink[] = [];
  for (const s of g.seqs) {
    s.items.forEach((it, i) => {
      nodes.push({ id: it.id, kind: it.kind, num: it.num });
      if (i > 0) links.push({ from: s.items[i - 1]!.id, to: it.id });
    });
  }
  for (const l of g.links) {
    const base = l.base ? ix.seq.get(l.base) : undefined;
    for (const n of l.nodes) {
      const s = ix.seq.get(n);
      if (!s) continue;
      if (l.kind === 'div') { const a = last(base), b = first(s); if (a && b) links.push({ from: a.id, to: b.id }); } else { const a = last(s), b = first(base); if (a && b) links.push({ from: a.id, to: b.id }); }
    }
  }
  for (const j of g.jumps) {
    const from = ix.seq.get(j.from);
    // Branche vide de divergence ET : le renvoi part de la dernière transition avant la barre.
    const a = from?.items.length ? last(from) : g.links.filter((l) => l.kind === 'div' && l.op === 'and' && l.nodes.includes(j.from)).map((l) => last(l.base ? ix.seq.get(l.base) : undefined)).find(Boolean);
    if (a && j.to) links.push({ from: a.id, to: j.to, jump: true });
  }
  return { nodes, links };
}
