import { checkSeq } from './grammar';
import { nextId } from './insertion';
import { locate, walkAll } from './tree';
import { isBlock } from './types';
import type { Grafcet, Item, Project } from './types';

/** Renvois qui arrivent sur un élément (convergence OU « libre »). */
export function arrivalsTo(g: Grafcet, targetId: string): Extract<Item, { kind: 'jump' }>[] {
  const out: Extract<Item, { kind: 'jump' }>[] = [];
  walkAll(g.items, (it) => { if (it.kind === 'jump' && it.target === targetId) out.push(it); });
  return out;
}

/**
 * Fins de séquence d'où l'on peut faire arriver un renvoi sur `targetId` : une transition pour une étape cible,
 * une étape pour une transition cible. Les fins qui rendraient la structure invalide sont écartées.
 */
export function arrivalSources(g: Grafcet, targetId: string): string[] {
  const target = locate(g.items, targetId)?.item;
  if (!target || (target.kind !== 'step' && target.kind !== 'trans')) return [];
  const want = target.kind === 'step' ? 'trans' : 'step';
  const out: string[] = [];
  const visit = (seq: Item[]): void => {
    const last = seq[seq.length - 1];
    if (last && last.kind === want) out.push(last.id);
    for (const it of seq) if (isBlock(it)) it.branches.forEach(visit);
  };
  visit(g.items);
  return out.filter((id) => {
    const copy: Grafcet = JSON.parse(JSON.stringify(g));
    const loc = locate(copy.items, id);
    if (!loc) return false;
    loc.seq.splice(loc.idx + 1, 0, { id: '?', kind: 'jump', target: targetId });
    return !checkSeq(copy.items, 'root');
  });
}

/** Ajoute un renvoi vers `targetId` à la suite de `sourceId` ; renvoie l'id du renvoi créé. */
export function addArrival(P: Project, g: Grafcet, targetId: string, sourceId: string): string | null {
  if (!arrivalSources(g, targetId).includes(sourceId)) return null;
  const loc = locate(g.items, sourceId);
  if (!loc) return null;
  const j: Item = { id: nextId(P), kind: 'jump', target: targetId };
  loc.seq.splice(loc.idx + 1, 0, j);
  return j.id;
}
