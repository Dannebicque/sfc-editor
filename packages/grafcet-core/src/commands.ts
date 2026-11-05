import { checkSeq } from './grammar';
import { mkStep, mkTrans, nextId } from './insertion';
import type { BlockKind, Item } from './types';
import { findItem, locate, sequencesOf, walkAll, walkGrafcet, locateIn } from './tree';
import type { Grafcet, Project } from './types';
import { isBlock } from './types';

/** Plus petite suppression qui garde la séquence valide : l'élément, l'élément + le suivant, ou le précédent + l'élément. */
function tryRemove(seq: Grafcet['items'], ctx: Parameters<typeof checkSeq>[1], i: number) {
  for (const [s, len] of [[i, 1], [i, 2], [i - 1, 2]] as const) {
    if (s < 0 || s + len > seq.length) continue;
    if (!checkSeq(seq.slice(0, s).concat(seq.slice(s + len)), ctx)) return { s, len };
  }
  return null;
}

export type RemoveResult = { ok: false } | { ok: true; nextSel: string | null };

/** Supprime l'élément `id` (et son intercalaire si nécessaire). Ne modifie rien si la suppression est impossible. */
export function removeItem(g: Grafcet, id: string): RemoveResult {
  const loc = locateIn(g, id);
  if (!loc) return { ok: false };
  const r = tryRemove(loc.seq, loc.ctx, loc.idx);
  if (!r) return { ok: false };
  const prevItem = loc.seq[r.s - 1];
  const gone = new Set<string>();
  walkAll(loc.seq.slice(r.s, r.s + r.len), (it) => gone.add(it.id));
  loc.seq.splice(r.s, r.len);
  // Une synchronisation ne peut plus attendre une étape supprimée.
  walkGrafcet(g, (it) => { if (it.kind === 'trans' && it.sync) { it.sync = it.sync.filter((s) => !gone.has(s)); if (!it.sync.length) delete it.sync; } });
  const cand = prevItem || loc.seq[r.s];
  const nextSel = cand ? (isBlock(cand) && !prevItem ? cand.id + ':d' : cand.id) : loc.block ? loc.block.id : null;
  return { ok: true, nextSel };
}

/** Ajoute une branche à gauche (side < 0) ou à droite de la branche courante / d'une divergence ; renvoie l'id du premier élément créé. */
export function addBranch(P: Project, g: Grafcet, id: string, side: -1 | 1): string | null {
  const loc = locateIn(g, id);
  if (!loc) return null;
  let block, bi: number;
  if (isBlock(loc.item)) { block = loc.item; bi = side < 0 ? 0 : block.branches.length - 1; }
  else if (loc.block) { block = loc.block; bi = loc.branchIdx; }
  else return null;
  const first = block.kind === 'or' ? mkTrans(P, g) : mkStep(P, g);
  block.branches.splice(side < 0 ? bi : bi + 1, 0, [first]);
  return first.id;
}

/** Supprime la branche contenant `id` (au moins 2 branches doivent rester) ; renvoie l'id à sélectionner. */
export function removeBranch(g: Grafcet, id: string): string | null {
  const loc = locateIn(g, id);
  if (!loc || !loc.block || loc.block.branches.length < 3) return null;
  loc.block.branches.splice(loc.branchIdx, 1);
  return loc.block.branches[Math.min(loc.branchIdx, loc.block.branches.length - 1)]![0]!.id;
}

/**
 * Renumérote les étapes à numéro entier (0…n) et les transitions (1…n) dans l'ordre du document, en mettant à jour les
 * références Xn des réceptivités. Les étapes dont l'identifiant est un texte (« INIT », « X3 »…) ne sont pas touchées.
 */
export function renumber(g: Grafcet): void {
  const map = new Map<string, string>();
  let n = 0, tn = 1;
  const stepNew = new Map<string, string>(), transNew = new Map<string, number>();
  walkGrafcet(g, (it) => {
    if (it.kind === 'step') { if (/^\d+$/.test(it.num)) { map.set(it.num, String(n)); stepNew.set(it.id, String(n++)); } }
    else if (it.kind === 'trans') transNew.set(it.id, tn++);
  });
  const rewrite = (s: string) => s.replace(/\bX(\d+)\b/g, (m, d: string) => (map.has(d) ? 'X' + map.get(d) : m));
  walkGrafcet(g, (it) => {
    if (it.kind === 'step') {
      if (stepNew.has(it.id)) it.num = stepNew.get(it.id)!;
      for (const a of it.actions) if (a.cond) a.cond = rewrite(a.cond);
    } else if (it.kind === 'trans') {
      it.num = transNew.get(it.id)!;
      it.recept = rewrite(it.recept);
    }
  });
  g.nextStep = n;
  g.nextTrans = tn;
}

export function newGrafcet(P: Project, name: string): Grafcet {
  const g: Grafcet = { id: 'g' + P.gcount++, name, nextStep: 0, nextTrans: 1, items: [] };
  const s = mkStep(P, g);
  if (s.kind === 'step') s.initial = true;
  g.items.push(s);
  return g;
}

/** Ajoute une séquence indépendante (une étape) à droite des autres ; renvoie l'id de cette étape. */
export function addSequence(P: Project, g: Grafcet): string {
  const s = mkStep(P, g);
  (g.more ??= []).push([s]);
  return s.id;
}

/** Séquence supplémentaire qui contient `id` (indice dans `g.more`), ou -1 (séquence principale ou inconnu). */
export const extraSequenceOf = (g: Grafcet, id: string): number => (g.more ?? []).findIndex((s) => !!findItem(s, id));

/** Indice de la séquence (0 = principale) qui contient `id`, ou -1. */
export const sequenceIndexOf = (g: Grafcet, id: string): number => sequencesOf(g).findIndex((s) => !!findItem(s, id));

/** Déplace la séquence qui contient `id` d'un cran à gauche (-1) ou à droite (+1) ; renvoie false si impossible. */
export function moveSequence(g: Grafcet, id: string, dir: -1 | 1): boolean {
  const all = sequencesOf(g);
  const k = sequenceIndexOf(g, id), j = k + dir;
  if (k < 0 || j < 0 || j >= all.length) return false;
  [all[k], all[j]] = [all[j]!, all[k]!];
  g.items = all[0]!;
  if (all.length > 1) g.more = all.slice(1); else delete g.more;
  return true;
}

/** Supprime la séquence supplémentaire qui contient `id` ; renvoie l'id à sélectionner ensuite, ou null si impossible. */
export function removeSequence(g: Grafcet, id: string): string | null {
  const i = extraSequenceOf(g, id);
  if (i < 0) return null;
  const gone = new Set<string>();
  walkAll(g.more![i]!, (it) => gone.add(it.id));
  g.more!.splice(i, 1);
  if (!g.more!.length) delete g.more;
  walkGrafcet(g, (it) => { if (it.kind === 'trans' && it.sync) { it.sync = it.sync.filter((s) => !gone.has(s)); if (!it.sync.length) delete it.sync; } });
  const next = (g.more ?? [])[Math.min(i, (g.more ?? []).length - 1)]?.[0] ?? g.items[0];
  return next ? next.id : null;
}

/** Copie profonde d'un GRAFCET avec de nouveaux ids de GRAFCET et d'éléments (les renvois sont réécrits). */
export function duplicateGrafcet(P: Project, g: Grafcet, name: string): Grafcet {
  const c: Grafcet = JSON.parse(JSON.stringify(g));
  c.id = 'g' + P.gcount++;
  c.name = name;
  const map = new Map<string, string>();
  walkGrafcet(c, (it) => { const nid = nextId(P); map.set(it.id, nid); it.id = nid; });
  walkGrafcet(c, (it) => {
    if (it.kind === 'jump' && it.target && map.has(it.target)) it.target = map.get(it.target)!;
    if (it.kind === 'trans' && it.sync) it.sync = it.sync.map((s) => map.get(s) ?? s);
  });
  return c;
}

export function stats(g: Grafcet) {
  const s = { steps: 0, trans: 0, blocks: 0, jumps: 0 };
  walkGrafcet(g, (it) => {
    if (it.kind === 'step') s.steps++;
    else if (it.kind === 'trans') s.trans++;
    else if (it.kind === 'jump') s.jumps++;
    else s.blocks++;
  });
  return s;
}

export { findItem };

export interface Wrapped { blockId: string; /** Premier élément de la branche créée (à sélectionner ensuite). */ firstId: string }

const probeFirst = (kind: BlockKind): Item =>
  kind === 'or' ? { id: '?', kind: 'trans', num: 0, recept: '' } : { id: '?', kind: 'step', num: '0', name: '', initial: false, actions: [] };

/** Plages candidates autour de l'indice i, de la plus petite à la plus large. */
const runsAround = (i: number): [number, number][] => [[i, i], [i - 1, i + 1], [i - 1, i], [i, i + 1]];

/**
 * Encadre l'élément `id` (et, si la grammaire l'exige, ses voisins) dans une nouvelle divergence `kind`
 * dont la seconde branche est une alternative (transition) ou un parallèle (étape) vide à compléter.
 * Cas typiques : une transition devient « deux transitions alternatives » ; une étape entourée de ses transitions
 * peut être contournée (saut d'étapes) ; une étape peut être doublée en parallèle.
 * Choisit la plus petite plage qui laisse la séquence valide ; renvoie null si aucune ne convient.
 */
export function wrapInBlock(P: Project, g: Grafcet, id: string, kind: BlockKind): Wrapped | null {
  const loc = locateIn(g, id);
  if (!loc || loc.item.kind === 'jump' || isBlock(loc.item)) return null;
  const { seq, ctx, idx } = loc;
  for (const [s, e] of runsAround(idx)) {
    if (s < 0 || e >= seq.length) continue;
    const run = seq.slice(s, e + 1);
    const probe: Item = { id: '?', kind, branches: [run, [probeFirst(kind)]] };
    if (checkSeq(seq.slice(0, s).concat(probe, seq.slice(e + 1)), ctx)) continue;
    const first = kind === 'or' ? mkTrans(P, g) : mkStep(P, g);
    const block: Item = { id: nextId(P), kind, branches: [run, [first]] };
    seq.splice(s, e - s + 1, block);
    return { blockId: block.id, firstId: first.id };
  }
  return null;
}

/** Vrai si `wrapInBlock` serait possible (sans rien modifier ni consommer d'identifiant). */
export function canWrapInBlock(g: Grafcet, id: string, kind: BlockKind): boolean {
  const loc = locateIn(g, id);
  if (!loc || loc.item.kind === 'jump' || isBlock(loc.item)) return false;
  const { seq, ctx, idx } = loc;
  return runsAround(idx).some(([s, e]) => {
    if (s < 0 || e >= seq.length) return false;
    const probe: Item = { id: '?', kind, branches: [seq.slice(s, e + 1), [probeFirst(kind)]] };
    return !checkSeq(seq.slice(0, s).concat(probe, seq.slice(e + 1)), ctx);
  });
}

/**
 * Dissout la divergence `blockId` en ne gardant que la branche `keep` (ses éléments prennent la place du bloc).
 * Renvoie l'id du premier élément conservé, ou null si le résultat violerait la grammaire (rien n'est modifié).
 * Les renvois qui visaient une branche supprimée deviennent invalides et seront signalés par la validation.
 */
export function unwrapBlock(g: Grafcet, blockId: string, keep: number): string | null {
  const loc = locateIn(g, blockId);
  if (!loc || !isBlock(loc.item)) return null;
  const branch = loc.item.branches[keep];
  if (!branch) return null;
  const next = loc.seq.slice(0, loc.idx).concat(branch, loc.seq.slice(loc.idx + 1));
  if (checkSeq(next, loc.ctx)) return null;
  loc.seq.splice(loc.idx, 1, ...branch);
  return branch[0]!.id;
}

/** Vrai si `unwrapBlock` serait possible pour cette branche. */
export function canUnwrapBlock(g: Grafcet, blockId: string, keep: number): boolean {
  const loc = locateIn(g, blockId);
  if (!loc || !isBlock(loc.item)) return false;
  const branch = loc.item.branches[keep];
  return !!branch && !checkSeq(loc.seq.slice(0, loc.idx).concat(branch, loc.seq.slice(loc.idx + 1)), loc.ctx);
}

/** Déplace d'un cran (dir = -1 vers la gauche, +1 vers la droite) la branche qui contient `id`. */
export function moveBranch(g: Grafcet, id: string, dir: -1 | 1): boolean {
  const loc = locateIn(g, id);
  if (!loc || !loc.block) return false;
  const bs = loc.block.branches, a = loc.branchIdx, b = a + dir;
  if (b < 0 || b >= bs.length) return false;
  [bs[a], bs[b]] = [bs[b]!, bs[a]!];
  return true;
}
