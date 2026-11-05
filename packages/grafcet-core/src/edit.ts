import { alternate, checkGraph, docOrder, first, indexOf, last, nodesOf } from './graph';
import type { Grafcet, HLink, Jump, Node, Project, Seq } from './types';

/** Génère un identifiant stable (chaîne opaque) à partir du compteur du projet : n (élément), q (séquence), l (lien), j (renvoi). */
export const nextId = (P: Project, prefix = 'n'): string => prefix + P.counter++;

export const mkStep = (P: Project, g: Grafcet): Node => ({ id: nextId(P), kind: 'step', num: String(g.nextStep++), name: '', initial: false, actions: [] });
export const mkTrans = (P: Project, g: Grafcet): Node => ({ id: nextId(P), kind: 'trans', num: g.nextTrans++, recept: '' });
const mk = (P: Project, g: Grafcet, kind: Node['kind']): Node => (kind === 'step' ? mkStep(P, g) : mkTrans(P, g));
const mkSeq = (P: Project, g: Grafcet, items: Node[]): Seq => { const s: Seq = { id: nextId(P, 'q'), items }; g.seqs.push(s); return s; };

/**
 * Applique `fn` au GRAFCET ; si le résultat est refusé (null) ou rend la structure incohérente, tout est annulé.
 * Toutes les opérations d'édition passent par là : le modèle reste donc toujours valide.
 */
function trial<T>(P: Project, g: Grafcet, fn: () => T | null): T | null {
  const saved = JSON.stringify(g), counter = P.counter;
  let r: T | null = null;
  try { r = fn(); } catch { r = null; }
  if (r !== null && !checkGraph(g)) return r;
  const back = JSON.parse(saved) as Grafcet;
  g.seqs = back.seqs; g.links = back.links; g.jumps = back.jumps; g.nextStep = back.nextStep; g.nextTrans = back.nextTrans;
  P.counter = counter;
  return null;
}

/** Vrai si l'opération réussirait (essai sur une copie ; ne modifie rien). */
export function probe(g: Grafcet, fn: (P: Project, g: Grafcet) => unknown): boolean {
  const c = JSON.parse(JSON.stringify(g)) as Grafcet;
  const P: Project = { name: '', counter: 1_000_000, gcount: 0, grafcets: [] };
  try { return fn(P, c) != null; } catch { return false; }
}

/** Coupe la séquence avant l'indice `at` : la queue hérite des liens de fin (base de divergence, convergence, renvoi). */
function splitSeq(P: Project, g: Grafcet, s: Seq, at: number): Seq {
  const tail: Seq = { id: nextId(P, 'q'), items: s.items.splice(at) };
  g.seqs.splice(g.seqs.indexOf(s) + 1, 0, tail);
  for (const l of g.links) {
    if (l.kind === 'div' && l.base === s.id) l.base = tail.id;
    if (l.kind === 'conv') l.nodes = l.nodes.map((n) => (n === s.id ? tail.id : n));
  }
  for (const j of g.jumps) if (j.from === s.id) j.from = tail.id;
  return tail;
}

/** Le début de `b` est transféré à `a` (fusion de séquences) : les liens de fin de `b` passent à `a`. */
function absorb(g: Grafcet, a: Seq, b: Seq): void {
  a.items.push(...b.items);
  for (const l of g.links) {
    if (l.kind === 'div' && l.base === b.id) l.base = a.id;
    if (l.kind === 'conv') l.nodes = l.nodes.map((n) => (n === b.id ? a.id : n));
  }
  for (const j of g.jumps) if (j.from === b.id) j.from = a.id;
  g.seqs.splice(g.seqs.indexOf(b), 1);
}

/** Nettoyage après une modification : renvois orphelins, liens à une seule branche (fusionnés), séquences vides inutiles. */
export function tidy(g: Grafcet): void {
  for (let guard = 0; guard < 100; guard++) {
    let changed = false;
    const ids = new Set(nodesOf(g).map((n) => n.id));
    for (const j of g.jumps) if (j.to && !ids.has(j.to)) j.to = null;
    const seqById = new Map(g.seqs.map((s) => [s.id, s] as const));
    g.jumps = g.jumps.filter((j) => { const s = seqById.get(j.from); return !!s && s.items.length > 0; });
    for (const l of g.links.slice()) {
      l.nodes = l.nodes.filter((n) => seqById.has(n));
      if (l.base && !seqById.has(l.base)) l.base = null;
      if (l.nodes.length >= 2) continue;
      changed = true;
      g.links.splice(g.links.indexOf(l), 1);
      const n = l.nodes[0] ? seqById.get(l.nodes[0]) : undefined, b = l.base ? seqById.get(l.base) : undefined;
      if (n && b) { if (l.kind === 'div') absorb(g, b, n); else absorb(g, n, b); }
    }
    if (changed) continue;
    const ix = indexOf(g);
    const targeted = new Set<string>();
    for (const j of g.jumps) if (j.to) targeted.add(ix.node.get(j.to)!.seq.id);
    const dead = g.seqs.find((s) => !s.items.length && !ix.startUse.has(s.id) && !ix.endUse.has(s.id) && g.seqs.length > 1 && !targeted.has(s.id));
    if (dead) { g.seqs.splice(g.seqs.indexOf(dead), 1); changed = true; }
    if (!changed) break;
  }
}

type Where = 'before' | 'after';
export const INSERT_KINDS: Node['kind'][] = ['step', 'trans'];

/** Formes d'insertion essayées dans l'ordre : l'élément seul, ou accompagné d'un intercalaire. */
const patterns = (k: Node['kind']): Node['kind'][][] => [[k], [k, alternate(k)], [alternate(k), k]];

/** Insère une étape ou une transition avant/après `id` (élément, ou séquence vide) ; ajoute un intercalaire si la grammaire l'exige. Renvoie l'id inséré. */
export function insertNode(P: Project, g: Grafcet, id: string, kind: Node['kind'], where: Where = 'after'): string | null {
  return trial(P, g, () => {
    const ix = indexOf(g);
    const seq = ix.seq.get(id) ?? ix.node.get(id)?.seq;
    if (!seq) return null;
    const at = ix.seq.has(id) ? 0 : where === 'before' ? ix.node.get(id)!.idx : ix.node.get(id)!.idx + 1;
    for (const pat of patterns(kind)) {
      const snap = JSON.stringify({ s: seq.items, a: g.nextStep, b: g.nextTrans });
      const made = pat.map((k) => mk(P, g, k));
      seq.items.splice(at, 0, ...made);
      if (!checkGraph(g)) return made[pat.indexOf(kind)]!.id;
      const o = JSON.parse(snap) as { s: Node[]; a: number; b: number };
      seq.items = o.s; g.nextStep = o.a; g.nextTrans = o.b;
    }
    return null;
  });
}
export const canInsert = (g: Grafcet, id: string, kind: Node['kind'], where: Where = 'after') => probe(g, (P, c) => insertNode(P, c, id, kind, where));

/** Éléments minimum d'une nouvelle branche : une transition pour un lien OU, une étape pour un lien ET (divergence comme convergence). */
const branchKind = (op: 'or' | 'and'): Node['kind'] => (op === 'or' ? 'trans' : 'step');

/**
 * Ajoute une divergence OU/ET après l'élément `id`. Si des éléments suivent, ils forment la première branche
 * et une branche vide est ajoutée à droite. Si l'élément a déjà une divergence de même type, une branche est ajoutée.
 * Une divergence OU suit une étape, une divergence ET suit une transition (un intercalaire est ajouté si besoin).
 */
export function addDivergence(P: Project, g: Grafcet, id: string, op: 'or' | 'and'): string | null {
  return trial(P, g, () => {
    let ix = indexOf(g);
    let loc = ix.node.get(id);
    if (!loc) return null;
    const want: Node['kind'] = op === 'or' ? 'step' : 'trans';
    let { seq, idx } = loc;
    if (loc.item.kind !== want) {
      if (idx < seq.items.length - 1) idx++;
      else { seq.items.push(mk(P, g, want)); idx++; }
    }
    ix = indexOf(g);
    const isLast = idx === seq.items.length - 1;
    const child = (): Seq => mkSeq(P, g, [mk(P, g, branchKind(op))]);
    if (isLast) {
      const e = ix.endUse.get(seq.id);
      if (e) {
        if ('link' in e && e.role === 'base' && e.link.op === op) { const c = child(); e.link.nodes.push(c.id); return c.items[0]!.id; }
        return null;
      }
      const c1 = child(), c2 = child();
      g.links.push({ id: nextId(P, 'l'), kind: 'div', op, base: seq.id, nodes: [c1.id, c2.id] });
      return c1.items[0]!.id;
    }
    const tail = splitSeq(P, g, seq, idx + 1);
    const c = child();
    g.links.push({ id: nextId(P, 'l'), kind: 'div', op, base: seq.id, nodes: [tail.id, c.id] });
    return c.items[0]!.id;
  });
}

/**
 * Ajoute une convergence OU/ET avant l'élément `id` (qui devient le début de la séquence aval). Les éléments qui
 * précèdent forment la première branche ; une branche à construire (vers le haut) est ajoutée à droite.
 * Une convergence OU précède une étape, une convergence ET précède une transition.
 */
export function addConvergence(P: Project, g: Grafcet, id: string, op: 'or' | 'and'): string | null {
  return trial(P, g, () => {
    let ix = indexOf(g);
    const loc = ix.node.get(id);
    if (!loc) return null;
    const want: Node['kind'] = op === 'or' ? 'step' : 'trans'; // nature du premier élément de la base
    const endKind: Node['kind'] = want === 'step' ? 'trans' : 'step'; // nature du dernier élément d'une branche
    const { seq } = loc;
    const child = (): Seq => mkSeq(P, g, [mk(P, g, endKind)]);
    // Sélection = début d'une base de même type : on ajoute simplement une branche à cette convergence.
    if (loc.idx === 0 && loc.item.kind === want) {
      const su = ix.startUse.get(seq.id);
      if (su && su.role === 'base' && su.link.op === op) { const c = child(); su.link.nodes.push(c.id); return c.items[0]!.id; }
    }
    // Sinon la barre se place juste APRÈS l'élément sélectionné : celui-ci (ou l'élément qui le suit) termine la branche existante.
    let e = loc.idx + (loc.item.kind === endKind ? 0 : 1);
    if (e >= seq.items.length) seq.items.push(mk(P, g, endKind));
    if (e + 1 >= seq.items.length) seq.items.push(mk(P, g, want));
    ix = indexOf(g);
    e++;
    const tail = splitSeq(P, g, seq, e);
    const c = child();
    g.links.push({ id: nextId(P, 'l'), kind: 'conv', op, base: tail.id, nodes: [seq.id, c.id] });
    return c.items[0]!.id;
  });
}

export type RemoveResult = { ok: false } | { ok: true; nextSel: string | null };

/** Supprime l'élément `id` (et son intercalaire si l'alternance l'exige). Rien n'est modifié si c'est impossible. */
export function removeNode(g: Grafcet, id: string): RemoveResult {
  const P: Project = { name: '', counter: 0, gcount: 0, grafcets: [] };
  const ix = indexOf(g);
  const loc = ix.node.get(id);
  if (!loc) return { ok: false };
  const { seq, idx } = loc;
  let nextSel: string | null = null;
  const done = trial(P, g, () => {
    for (const [s, len] of [[idx, 1], [idx, 2], [idx - 1, 2]] as const) {
      if (s < 0 || s + len > seq.items.length) continue;
      const snap = JSON.stringify(seq.items);
      const removed = seq.items.splice(s, len);
      const gone = new Set(removed.map((r) => r.id));
      const hit = g.jumps.filter((j) => j.to && gone.has(j.to)).map((j) => [j, j.to] as const);
      for (const [j] of hit) j.to = null;
      if (!checkGraph(g)) {
        const cand = seq.items[s - 1] ?? seq.items[s];
        nextSel = cand ? cand.id : seq.id;
        return true;
      }
      seq.items = JSON.parse(snap) as Node[];
      for (const [j, to] of hit) j.to = to;
    }
    return null;
  });
  if (!done) return { ok: false };
  tidy(g);
  if (nextSel && !indexOf(g).seq.has(nextSel) && !indexOf(g).node.has(nextSel)) nextSel = null;
  return { ok: true, nextSel };
}

/** Détache la barre (divergence ou convergence) : les séquences restent en place, sans lien. */
export function removeLink(g: Grafcet, linkId: string): string | null {
  const l = g.links.find((x) => x.id === linkId);
  if (!l) return null;
  g.links = g.links.filter((x) => x !== l);
  return l.base ?? l.nodes[0] ?? null;
}

export interface Anchor { link: HLink; seq: Seq | null }
/** Lien visé par une sélection (id de lien, d'élément ou de séquence). */
export function resolveLink(g: Grafcet, sel: string): Anchor | null {
  const ix = indexOf(g);
  const l = ix.link.get(sel);
  if (l) return { link: l, seq: null };
  const seq = ix.seq.get(sel) ?? ix.node.get(sel)?.seq;
  if (!seq) return null;
  const su = ix.startUse.get(seq.id), eu = ix.endUse.get(seq.id);
  if (su && su.role === 'child') return { link: su.link, seq };
  if (eu && 'link' in eu) return { link: eu.link, seq };
  if (su) return { link: su.link, seq };
  return null;
}

/** Ajoute une branche à gauche (side < 0) ou à droite d'un lien (ou de la branche sélectionnée) ; renvoie l'id de son premier élément. */
export function addBranch(P: Project, g: Grafcet, sel: string, side: -1 | 1): string | null {
  return trial(P, g, () => {
    const a = resolveLink(g, sel);
    if (!a) return null;
    const c = mkSeq(P, g, [mk(P, g, branchKind(a.link.op))]);
    const at = a.seq && a.link.nodes.includes(a.seq.id) ? a.link.nodes.indexOf(a.seq.id) + (side < 0 ? 0 : 1) : side < 0 ? 0 : a.link.nodes.length;
    a.link.nodes.splice(at, 0, c.id);
    return c.items[0]!.id;
  });
}

/** Retire la branche sélectionnée du lien. Elle est supprimée si rien d'autre ne s'y rattache, sinon elle reste libre. */
export function removeBranch(g: Grafcet, sel: string): string | null {
  const a = resolveLink(g, sel);
  if (!a || !a.seq || !a.link.nodes.includes(a.seq.id)) return null;
  const ix = indexOf(g);
  const s = a.seq, l = a.link;
  const otherSide = l.kind === 'div' ? ix.endUse.get(s.id) : ix.startUse.get(s.id);
  const targeted = g.jumps.some((j) => j.to && s.items.some((i) => i.id === j.to));
  const at = l.nodes.indexOf(s.id);
  l.nodes.splice(at, 1);
  if (!otherSide && !targeted) g.seqs = g.seqs.filter((x) => x !== s);
  tidy(g);
  const stillThere = g.links.find((x) => x.id === l.id);
  const nxt = stillThere ? g.seqs.find((x) => x.id === stillThere.nodes[Math.min(at, stillThere.nodes.length - 1)]) : undefined;
  return nxt?.items[0]?.id ?? nxt?.id ?? l.base ?? null;
}

/** Déplace d'un cran la branche sélectionnée dans son lien. */
export function moveBranch(g: Grafcet, sel: string, dir: -1 | 1): boolean {
  const a = resolveLink(g, sel);
  if (!a || !a.seq) return false;
  const ns = a.link.nodes, i = ns.indexOf(a.seq.id), j = i + dir;
  if (i < 0 || j < 0 || j >= ns.length) return false;
  [ns[i], ns[j]] = [ns[j]!, ns[i]!];
  return true;
}

/**
 * Relie deux éléments : `a` doit terminer une séquence. Selon le cas : les deux séquences fusionnent, `a` rejoint une
 * convergence dont `b` ouvre l'aval, `b` devient une branche de la divergence que `a` termine, ou, à défaut, un renvoi de `a` vers `b`.
 */
export function connect(P: Project, g: Grafcet, a: string, b: string): string | null {
  const ix0 = indexOf(g);
  const la = ix0.node.get(a), lb = ix0.node.get(b);
  if (!la || !lb || last(la.seq)!.id !== a) return null;
  const A = la.seq.id, B = lb.seq.id, bFirst = first(lb.seq)!.id === b;
  const attempts: (() => string | null)[] = [
    () => {
      const ix = indexOf(g);
      const e = ix.endUse.get(A);
      if (A === B || !bFirst) return null;
      if (!e && !ix.startUse.has(B)) { absorb(g, ix.seq.get(A)!, ix.seq.get(B)!); return b; }
      if (!e) { const su = ix.startUse.get(B)!; if (su.role !== 'base') return null; su.link.nodes.push(A); return b; }
      if ('link' in e && e.role === 'base' && !ix.startUse.has(B)) { e.link.nodes.push(B); return b; }
      return null;
    },
    () => {
      if (indexOf(g).endUse.has(A)) return null;
      const j: Jump = { id: nextId(P, 'j'), from: A, to: b };
      g.jumps.push(j);
      return j.id;
    },
  ];
  for (const f of attempts) { const r = trial(P, g, f); if (r) return r; }
  return null;
}

/** Réunit deux fins de séquence libres en une convergence (OU si elles finissent par une transition, ET par une étape) ; la séquence aval est à construire. */
export function mergeEnds(P: Project, g: Grafcet, a: string, b: string): string | null {
  return trial(P, g, () => {
    const ix = indexOf(g);
    const la = ix.node.get(a), lb = ix.node.get(b);
    if (!la || !lb || la.seq === lb.seq || last(la.seq)!.id !== a || last(lb.seq)!.id !== b || la.item.kind !== lb.item.kind) return null;
    const op = la.item.kind === 'trans' ? 'or' : 'and';
    const base = mkSeq(P, g, [mk(P, g, alternate(la.item.kind))]);
    g.links.push({ id: nextId(P, 'l'), kind: 'conv', op, base: base.id, nodes: [la.seq.id, lb.seq.id] });
    return base.items[0]!.id;
  });
}

/** Réunit deux débuts de séquence libres en une divergence (OU s'ils commencent par une transition, ET par une étape) ; la séquence amont est à construire. */
export function mergeStarts(P: Project, g: Grafcet, a: string, b: string): string | null {
  return trial(P, g, () => {
    const ix = indexOf(g);
    const la = ix.node.get(a), lb = ix.node.get(b);
    if (!la || !lb || la.seq === lb.seq || first(la.seq)!.id !== a || first(lb.seq)!.id !== b || la.item.kind !== lb.item.kind) return null;
    const op = la.item.kind === 'trans' ? 'or' : 'and';
    const base = mkSeq(P, g, [mk(P, g, alternate(la.item.kind))]);
    g.links.push({ id: nextId(P, 'l'), kind: 'div', op, base: base.id, nodes: [la.seq.id, lb.seq.id] });
    return base.items[0]!.id;
  });
}

/** Cibles possibles d'un renvoi parti de la fin de la séquence de `id` : tout élément de type opposé. */
export function jumpTargets(g: Grafcet, id: string): string[] {
  const ix = indexOf(g);
  const j = ix.jump.get(id);
  const seq = j ? ix.seq.get(j.from) : ix.node.get(id)?.seq;
  const end = last(seq);
  if (!end) return [];
  return nodesOf(g).filter((n) => n.kind !== end.kind).map((n) => n.id);
}

/** Ajoute un renvoi depuis la fin de la séquence de `id` (qui doit être libre) ; sans cible, choisit l'étape initiale ou le premier élément possible. */
export function addJump(P: Project, g: Grafcet, id: string, target?: string | null): string | null {
  return trial(P, g, () => {
    const ix = indexOf(g);
    const loc = ix.node.get(id);
    if (!loc || last(loc.seq)!.id !== id || ix.endUse.has(loc.seq.id)) return null;
    let to = target ?? null;
    if (!to) {
      const cands = nodesOf(g).filter((n) => n.kind !== loc.item.kind);
      to = (cands.find((n) => n.kind === 'step' && n.initial) ?? cands[0])?.id ?? null;
    }
    const j: Jump = { id: nextId(P, 'j'), from: loc.seq.id, to };
    g.jumps.push(j);
    return j.id;
  });
}

export function setJumpTarget(P: Project, g: Grafcet, jumpId: string, target: string | null): boolean {
  return !!trial(P, g, () => { const j = g.jumps.find((x) => x.id === jumpId); if (!j) return null; j.to = target; return true; });
}
export function removeJump(g: Grafcet, jumpId: string): string | null {
  const j = g.jumps.find((x) => x.id === jumpId);
  if (!j) return null;
  g.jumps = g.jumps.filter((x) => x !== j);
  const s = g.seqs.find((x) => x.id === j.from);
  return last(s)?.id ?? s?.id ?? null;
}

/** Nouvelle séquence libre (une étape, ou une transition source). */
export function newSeq(P: Project, g: Grafcet, kind: Node['kind'] = 'step'): string {
  const n = mk(P, g, kind);
  if (n.kind === 'step' && !nodesOf(g).some((x) => x.kind === 'step' && x.initial)) n.initial = true;
  mkSeq(P, g, [n]);
  return n.id;
}

/** Nouveau lien ouvert (divergence sans amont, ou convergence sans aval) avec deux branches ; renvoie l'id du premier élément. */
export function addOpenLink(P: Project, g: Grafcet, kind: 'div' | 'conv', op: 'or' | 'and'): string {
  const a = mkSeq(P, g, [mk(P, g, branchKind(op))]), b = mkSeq(P, g, [mk(P, g, branchKind(op))]);
  g.links.push({ id: nextId(P, 'l'), kind, op, base: null, nodes: [a.id, b.id] });
  return a.items[0]!.id;
}

/**
 * Renumérote les étapes à numéro entier (0…n) et les transitions (1…n) dans l'ordre du document, en mettant à jour les
 * références Xn des réceptivités. Les étapes dont l'identifiant est un texte (« INIT », « X3 »…) ne sont pas touchées.
 */
export function renumber(g: Grafcet): void {
  const ordered = docOrder(g).flatMap((s) => s.items);
  const map = new Map<string, string>();
  let n = 0, tn = 1;
  const stepNew = new Map<string, string>(), transNew = new Map<string, number>();
  for (const it of ordered) {
    if (it.kind === 'step') { if (/^\d+$/.test(it.num)) { map.set(it.num, String(n)); stepNew.set(it.id, String(n++)); } } else transNew.set(it.id, tn++);
  }
  const rewrite = (s: string) => s.replace(/\bX(\d+)\b/g, (m, d: string) => (map.has(d) ? 'X' + map.get(d) : m));
  for (const it of ordered) {
    if (it.kind === 'step') {
      if (stepNew.has(it.id)) it.num = stepNew.get(it.id)!;
      for (const a of it.actions) if (a.cond) a.cond = rewrite(a.cond);
    } else {
      it.num = transNew.get(it.id)!;
      it.recept = rewrite(it.recept);
      for (const a of it.actions ?? []) if (a.cond) a.cond = rewrite(a.cond);
    }
  }
  g.nextStep = n;
  g.nextTrans = tn;
}

/** Numérote les transitions 1…n dans l'ordre du document (sans toucher aux étapes). */
export function numberTransitions(g: Grafcet): void {
  let tn = 1;
  for (const s of docOrder(g)) for (const it of s.items) if (it.kind === 'trans') it.num = tn++;
  g.nextTrans = tn;
}

export function newGrafcet(P: Project, name: string): Grafcet {
  const g: Grafcet = { id: 'g' + P.gcount++, name, nextStep: 0, nextTrans: 1, seqs: [], links: [], jumps: [] };
  const s = mkStep(P, g);
  if (s.kind === 'step') s.initial = true;
  mkSeq(P, g, [s]);
  return g;
}

/** Copie profonde d'un GRAFCET avec de nouveaux identifiants (GRAFCET, séquences, liens, renvois, éléments). */
export function duplicateGrafcet(P: Project, g: Grafcet, name: string): Grafcet {
  const c: Grafcet = JSON.parse(JSON.stringify(g));
  c.id = 'g' + P.gcount++;
  c.name = name;
  const map = new Map<string, string>();
  const fresh = (old: string, prefix: string) => { const n = nextId(P, prefix); map.set(old, n); return n; };
  for (const s of c.seqs) { s.id = fresh(s.id, 'q'); for (const it of s.items) it.id = fresh(it.id, 'n'); }
  const m = (id: string | null) => (id === null ? null : map.get(id) ?? id);
  for (const l of c.links) { l.id = fresh(l.id, 'l'); l.base = m(l.base); l.nodes = l.nodes.map((n) => m(n)!); }
  for (const j of c.jumps) { j.id = fresh(j.id, 'j'); j.from = m(j.from)!; j.to = m(j.to); }
  return c;
}

export function stats(g: Grafcet) {
  const n = nodesOf(g);
  return { steps: n.filter((x) => x.kind === 'step').length, trans: n.filter((x) => x.kind === 'trans').length, blocks: g.links.length, jumps: g.jumps.length, seqs: g.seqs.length };
}

/** Ce que la sélection permet de faire (pour activer ou non les commandes de la barre d'outils). */
export interface Capabilities {
  insert: Record<'step' | 'trans', Record<Where, boolean>>;
  div: Record<'or' | 'and', boolean>;
  conv: Record<'or' | 'and', boolean>;
  remove: boolean;
  removeLink: boolean;
  jump: boolean;
  removeJump: boolean;
  branch: boolean;
  removeBranch: boolean;
  move: boolean;
}

export function capabilities(g: Grafcet, sel: string | null): Capabilities {
  const off = { before: false, after: false };
  const c: Capabilities = {
    insert: { step: { ...off }, trans: { ...off } }, div: { or: false, and: false }, conv: { or: false, and: false },
    remove: false, removeLink: false, jump: false, removeJump: false, branch: false, removeBranch: false, move: false,
  };
  if (!sel) return c;
  const ix = indexOf(g);
  const isNode = ix.node.has(sel), isSeq = ix.seq.has(sel);
  if (isNode || isSeq) {
    for (const k of INSERT_KINDS) for (const w of ['before', 'after'] as const) c.insert[k][w] = canInsert(g, sel, k, w);
  }
  if (isNode) {
    for (const op of ['or', 'and'] as const) {
      c.div[op] = probe(g, (P, x) => addDivergence(P, x, sel, op));
      c.conv[op] = probe(g, (P, x) => addConvergence(P, x, sel, op));
    }
    c.remove = probe(g, (_P, x) => (removeNode(x, sel).ok ? true : null));
    c.jump = probe(g, (P, x) => addJump(P, x, sel));
  }
  if (isSeq) c.remove = true;
  c.removeLink = ix.link.has(sel);
  c.removeJump = ix.jump.has(sel);
  const a = resolveLink(g, sel);
  c.branch = !!a;
  c.removeBranch = !!a && !!a.seq && a.link.nodes.includes(a.seq.id);
  c.move = c.removeBranch;
  return c;
}

/** Supprime une séquence vide (emplacement « X ») ou une séquence entière (et ses éléments) si elle est libre. */
export function removeSeq(g: Grafcet, seqId: string): boolean {
  const ix = indexOf(g);
  const s = ix.seq.get(seqId);
  if (!s || g.seqs.length < 2) return false;
  g.links = g.links.map((l) => ({ ...l, base: l.base === seqId ? null : l.base, nodes: l.nodes.filter((n) => n !== seqId) }));
  g.seqs = g.seqs.filter((x) => x !== s);
  tidy(g);
  return true;
}
