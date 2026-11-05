import { walkAll } from './tree';
import type { Grafcet, Item } from './types';

export interface FlatNode { id: string; kind: 'step' | 'trans'; num: number }
export interface FlatLink { from: string; to: string; jump?: true }
export interface FlatGraph { nodes: FlatNode[]; links: FlatLink[] }

/** Graphe plat (étapes/transitions et liaisons) dérivé de l'arbre. */
export function flatten(g: Grafcet): FlatGraph {
  const nodes = new Map<string, FlatNode>();
  const links: FlatLink[] = [];
  function walk(seq: Item[], preds: string[]): string[] {
    let tails = preds.slice();
    for (const it of seq) {
      if (it.kind === 'step' || it.kind === 'trans') {
        nodes.set(it.id, { id: it.id, kind: it.kind, num: it.num });
        for (const p of tails) links.push({ from: p, to: it.id });
        tails = [it.id];
      } else if (it.kind === 'or' || it.kind === 'and') {
        const nt: string[] = [];
        for (const b of it.branches) nt.push(...walk(b, tails));
        tails = nt;
      } else if (it.kind === 'jump') {
        if (it.target) for (const p of tails) links.push({ from: p, to: it.target, jump: true });
        tails = [];
      }
    }
    return tails;
  }
  walk(g.items, []);
  return { nodes: [...nodes.values()], links };
}

export function stepsOf(g: Grafcet) {
  const out: Extract<Item, { kind: 'step' }>[] = [];
  walkAll(g.items, (it) => { if (it.kind === 'step') out.push(it); });
  return out;
}
