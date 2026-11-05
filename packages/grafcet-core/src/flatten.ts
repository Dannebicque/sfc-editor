import { sequencesOf, walkAll, walkGrafcet } from './tree';
import type { Grafcet, Item } from './types';

export interface FlatNode { id: string; kind: 'step' | 'trans'; num: string | number }
export interface FlatLink { from: string; to: string; jump?: true; sync?: true }
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
        if (it.kind === 'trans') for (const s of it.sync ?? []) links.push({ from: s, to: it.id, sync: true });
        tails = [it.id];
      } else if (it.kind === 'or' || it.kind === 'and') {
        const nt: string[] = [];
        // Une branche ET qui finit par une transition puits ne converge pas.
        for (const b of it.branches) { const t = walk(b, tails); if (!(it.kind === 'and' && b[b.length - 1]?.kind === 'trans')) nt.push(...t); }
        tails = nt;
      } else if (it.kind === 'jump') {
        if (it.target) for (const p of tails) links.push({ from: p, to: it.target, jump: true });
        tails = [];
      }
    }
    return tails;
  }
  for (const s of sequencesOf(g)) walk(s, []);
  return { nodes: [...nodes.values()], links };
}

export function stepsOf(g: Grafcet) {
  const out: Extract<Item, { kind: 'step' }>[] = [];
  walkGrafcet(g, (it) => { if (it.kind === 'step') out.push(it); });
  return out;
}
