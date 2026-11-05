import { isBlock, type Item, type ItemKind, type SeqContext } from './types';

/** Branche ET qui ne converge pas : elle finit par un renvoi ou par une transition puits. */
export const endsApart = (b: Item[]): boolean => { const k = b[b.length - 1]?.kind; return k === 'jump' || k === 'trans'; };

/** Alternance étape / transition : une divergence OU commence par une transition, ET par une étape. */
const TYPE: Record<ItemKind, 'S' | 'T'> = { step: 'S', trans: 'T', or: 'S', and: 'T', jump: 'S' };

/** Grammaire : renvoie null si la séquence est valide, sinon la clé du message d'erreur. */
export function checkSeq(items: Item[], ctx: SeqContext): string | null {
  if (!items.length) return 'chk_empty';
  const want = ctx === 'or' ? 'trans' : 'step';
  // Au premier niveau, une séquence peut commencer par une transition source (sans étape amont, CEI 60848).
  // Une branche peut aussi commencer par un bloc de l'autre famille (OU suivi directement d'un ET, et inversement).
  const first = items[0]!;
  const startOk = first.kind === want || (ctx === 'root' && first.kind === 'trans')
    || (ctx === 'or' && first.kind === 'and') || (ctx === 'and' && (first.kind === 'or' || first.kind === 'jump'));
  if (!startOk) return ctx === 'or' ? 'chk_start_or' : 'chk_start_and';
  let prev: Item | null = null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it.kind === 'step' || it.kind === 'trans') {
      if (prev) {
        if (isBlock(prev)) {
          if (TYPE[prev.kind] !== TYPE[it.kind]) return 'chk_after_block';
        } else if (prev.kind === 'jump') return 'chk_after_jump';
        else if (TYPE[prev.kind] === TYPE[it.kind]) return 'chk_alternation';
      }
    } else if (isBlock(it)) {
      if (prev ? isBlock(prev) || prev.kind === 'jump' || TYPE[prev.kind] !== TYPE[it.kind] : ctx === 'root') return 'chk_block_place';
      if (it.branches.length < 2) return 'chk_min_branches';
      for (const b of it.branches) {
        const e = checkSeq(b, it.kind);
        if (e) return e;
      }
      if (it.kind === 'and' && it.branches.every(endsApart)) return 'chk_and_all_jump';
    } else if (it.kind === 'jump') {
      if (i !== items.length - 1) return 'chk_jump_last';
      // Un renvoi suit une étape ou une transition ; dans une branche ET, il peut aussi constituer toute la branche.
      if (prev ? isBlock(prev) : ctx !== 'and') return 'chk_jump_place';
    } else return 'chk_unknown';
    prev = it;
  }
  const last = items[items.length - 1]!;
  if (isBlock(last)) return 'chk_block_end';
  if (ctx === 'or' && !(last.kind === 'trans' || last.kind === 'jump')) return 'chk_or_end';
  if (ctx === 'and' && last.kind !== 'step' && last.kind !== 'jump' && last.kind !== 'trans') return 'chk_and_end';
  return null;
}
