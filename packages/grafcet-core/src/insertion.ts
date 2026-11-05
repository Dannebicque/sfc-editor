import { checkSeq } from './grammar';
import { locate, walkAll } from './tree';
import type { Grafcet, Item, ItemKind, Project, SeqContext } from './types';
import { isBlock } from './types';

/** Génère un identifiant d'élément stable (chaîne opaque) à partir du compteur du projet. */
export const nextId = (P: Project): string => 'n' + P.counter++;

export const mkStep = (P: Project, g: Grafcet): Item => ({
  id: nextId(P), kind: 'step', num: g.nextStep++, name: '', initial: false, actions: [],
});
export const mkTrans = (P: Project, g: Grafcet): Item => ({
  id: nextId(P), kind: 'trans', num: g.nextTrans++, recept: '',
});

/** Formes d'insertion possibles pour chaque type d'élément : l'élément seul, ou avec un intercalaire. */
const PATTERNS: Record<ItemKind, ItemKind[][]> = {
  step: [['step'], ['step', 'trans']],
  trans: [['trans'], ['trans', 'step']],
  or: [['or', 'step']],
  and: [['and', 'trans']],
  jump: [['jump']],
};

/** Éléments factices, uniquement pour tester la validité d'une séquence. */
function probeItem(kind: ItemKind): Item {
  if (kind === 'or') return { id: '?', kind, branches: [[{ id: '?', kind: 'trans', num: 0, recept: '' }], [{ id: '?', kind: 'trans', num: 0, recept: '' }]] };
  if (kind === 'and') return { id: '?', kind, branches: [[{ id: '?', kind: 'step', num: 0, name: '', initial: false, actions: [] }], [{ id: '?', kind: 'step', num: 0, name: '', initial: false, actions: [] }]] };
  if (kind === 'jump') return { id: '?', kind, target: null };
  if (kind === 'step') return { id: '?', kind, num: 0, name: '', initial: false, actions: [] };
  return { id: '?', kind: 'trans', num: 0, recept: '' };
}

/** Quelle forme d'insertion garde la séquence valide ? (élément seul, ou avec un intercalaire) */
export function findPattern(seq: Item[], ctx: SeqContext, idx: number, kind: ItemKind): ItemKind[] | null {
  for (const pat of PATTERNS[kind]) {
    const test = seq.slice(0, idx + 1).concat(pat.map(probeItem), seq.slice(idx + 1));
    if (!checkSeq(test, ctx)) return pat;
  }
  return null;
}

export interface Insertion {
  kind: ItemKind;
  /** Clé du message qui explique l'élément intercalaire ajouté, le cas échéant. */
  noteKey: string | null;
}

function noteKeyFor(kind: ItemKind, pat: ItemKind[]): string | null {
  if (kind === 'or') return 'note_or';
  if (kind === 'and') return 'note_and';
  if (pat.length > 1) return pat[1] === 'step' ? 'note_step_ins' : 'note_trans_ins';
  return null;
}

export const INSERT_KINDS: ItemKind[] = ['step', 'trans', 'or', 'and', 'jump'];

/**
 * Insertions valides après l'élément sélectionné.
 * `id` peut porter le suffixe « :d » (barre de divergence) : aucune insertion n'est alors proposée.
 */
export function allowedInsertions(g: Grafcet, id: string | null): Insertion[] {
  if (!id || id.endsWith(':d')) return [];
  const loc = locate(g.items, id);
  if (!loc || loc.item.kind === 'jump') return [];
  const out: Insertion[] = [];
  for (const kind of INSERT_KINDS) {
    const pat = findPattern(loc.seq, loc.ctx, loc.idx, kind);
    if (!pat) continue;
    if (kind === 'jump') {
      const want = loc.item.kind === 'step' ? 'trans' : 'step';
      let any = false;
      walkAll(g.items, (it) => { if (it.kind === want) any = true; });
      if (!any) continue;
    }
    out.push({ kind, noteKey: noteKeyFor(kind, pat) });
  }
  return out;
}

function mkItem(P: Project, g: Grafcet, kind: ItemKind, prev: Item): Item {
  if (kind === 'step') return mkStep(P, g);
  if (kind === 'trans') return mkTrans(P, g);
  if (kind === 'or') return { id: nextId(P), kind, branches: [[mkTrans(P, g)], [mkTrans(P, g)]] };
  if (kind === 'and') return { id: nextId(P), kind, branches: [[mkStep(P, g)], [mkStep(P, g)]] };
  const want = prev.kind === 'step' ? 'trans' : 'step';
  let target: string | null = null;
  walkAll(g.items, (it) => { if (!target && it.kind === want && (want === 'trans' || (it.kind === 'step' && it.initial))) target = it.id; });
  if (!target) walkAll(g.items, (it) => { if (!target && it.kind === want) target = it.id; });
  return { id: nextId(P), kind: 'jump', target };
}

/**
 * Insère un élément après `id` et renvoie l'id à sélectionner ensuite.
 * L'appelant doit avoir vérifié que l'insertion est permise (voir allowedInsertions).
 */
export function insertAfter(P: Project, g: Grafcet, id: string, kind: ItemKind): string {
  const loc = locate(g.items, id);
  if (!loc) throw new Error('élément introuvable : ' + id);
  const pat = findPattern(loc.seq, loc.ctx, loc.idx, kind);
  if (!pat) throw new Error('insertion impossible : ' + kind);
  const made = pat.map((k) => mkItem(P, g, k, loc.item));
  loc.seq.splice(loc.idx + 1, 0, ...made);
  const first = made[0]!;
  return isBlock(first) ? first.branches[0]![0]!.id : first.id;
}
