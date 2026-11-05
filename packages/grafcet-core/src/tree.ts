import type { BlockKind, Block, Item, SeqContext } from './types';

export function walkAll(
  items: Item[],
  fn: (it: Item, ctx: SeqContext, parent: Block | null) => void,
  ctx: SeqContext = 'root',
  parent: Block | null = null,
): void {
  for (const it of items) {
    fn(it, ctx, parent);
    if (it.kind === 'or' || it.kind === 'and') for (const b of it.branches) walkAll(b, fn, it.kind, it);
  }
}

export function findItem(items: Item[], id: string): Item | null {
  let r: Item | null = null;
  walkAll(items, (it) => {
    if (it.id === id) r = it;
  });
  return r;
}

export interface Location {
  seq: Item[];
  idx: number;
  ctx: SeqContext;
  block: Block | null;
  branchIdx: number;
  item: Item;
}

export function locate(
  seq: Item[],
  id: string,
  ctx: SeqContext = 'root',
  block: Block | null = null,
  branchIdx = -1,
): Location | null {
  for (let i = 0; i < seq.length; i++) {
    const it = seq[i]!;
    if (it.id === id) return { seq, idx: i, ctx, block, branchIdx, item: it };
    if (it.kind === 'or' || it.kind === 'and') {
      for (let b = 0; b < it.branches.length; b++) {
        const r = locate(it.branches[b]!, id, it.kind as BlockKind, it, b);
        if (r) return r;
      }
    }
  }
  return null;
}
