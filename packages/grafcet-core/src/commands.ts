import { checkSeq } from './grammar';
import { mkStep, mkTrans } from './insertion';
import { findItem, locate, walkAll } from './tree';
import type { Grafcet, Project } from './types';
import { isBlock } from './types';
import { nextId } from './insertion';

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
  const loc = locate(g.items, id);
  if (!loc) return { ok: false };
  const r = tryRemove(loc.seq, loc.ctx, loc.idx);
  if (!r) return { ok: false };
  const prevItem = loc.seq[r.s - 1];
  loc.seq.splice(r.s, r.len);
  const cand = prevItem || loc.seq[r.s];
  const nextSel = cand ? (isBlock(cand) && !prevItem ? cand.id + ':d' : cand.id) : loc.block ? loc.block.id : null;
  return { ok: true, nextSel };
}

/** Ajoute une branche à gauche (side < 0) ou à droite de la branche courante / d'une divergence ; renvoie l'id du premier élément créé. */
export function addBranch(P: Project, g: Grafcet, id: string, side: -1 | 1): string | null {
  const loc = locate(g.items, id);
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
  const loc = locate(g.items, id);
  if (!loc || !loc.block || loc.block.branches.length < 3) return null;
  loc.block.branches.splice(loc.branchIdx, 1);
  return loc.block.branches[Math.min(loc.branchIdx, loc.block.branches.length - 1)]![0]!.id;
}

/** Renumérote étapes (0…n) et transitions (1…n) dans l'ordre du document, en mettant à jour les références Xn des réceptivités. */
export function renumber(g: Grafcet): void {
  const map = new Map<number, number>();
  let n = 0, tn = 1;
  const stepNew = new Map<string, number>(), transNew = new Map<string, number>();
  walkAll(g.items, (it) => {
    if (it.kind === 'step') { map.set(it.num, n); stepNew.set(it.id, n++); }
    else if (it.kind === 'trans') transNew.set(it.id, tn++);
  });
  const rewrite = (s: string) => s.replace(/\bX(\d+)\b/g, (m, d: string) => (map.has(+d) ? 'X' + map.get(+d) : m));
  walkAll(g.items, (it) => {
    if (it.kind === 'step') {
      it.num = stepNew.get(it.id)!;
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

/** Copie profonde d'un GRAFCET avec de nouveaux ids de GRAFCET et d'éléments (les renvois sont réécrits). */
export function duplicateGrafcet(P: Project, g: Grafcet, name: string): Grafcet {
  const c: Grafcet = JSON.parse(JSON.stringify(g));
  c.id = 'g' + P.gcount++;
  c.name = name;
  const map = new Map<string, string>();
  walkAll(c.items, (it) => { const nid = nextId(P); map.set(it.id, nid); it.id = nid; });
  walkAll(c.items, (it) => { if (it.kind === 'jump' && it.target && map.has(it.target)) it.target = map.get(it.target)!; });
  return c;
}

export function stats(g: Grafcet) {
  const s = { steps: 0, trans: 0, blocks: 0, jumps: 0 };
  walkAll(g.items, (it) => {
    if (it.kind === 'step') s.steps++;
    else if (it.kind === 'trans') s.trans++;
    else if (it.kind === 'jump') s.jumps++;
    else s.blocks++;
  });
  return s;
}

export { findItem };
