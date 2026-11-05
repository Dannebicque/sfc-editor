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

/** Toutes les séquences d'un GRAFCET : la principale, puis les séquences supplémentaires. */
export const sequencesOf = (g: { items: Item[]; more?: Item[][] }): Item[][] => [g.items, ...(g.more ?? [])];

export function walkGrafcet(g: { items: Item[]; more?: Item[][] }, fn: Parameters<typeof walkAll>[1]): void {
  for (const s of sequencesOf(g)) walkAll(s, fn);
}

export function findInGrafcet(g: { items: Item[]; more?: Item[][] }, id: string): Item | null {
  for (const s of sequencesOf(g)) { const r = findItem(s, id); if (r) return r; }
  return null;
}

export function locateIn(g: { items: Item[]; more?: Item[][] }, id: string): Location | null {
  for (const s of sequencesOf(g)) { const r = locate(s, id); if (r) return r; }
  return null;
}
