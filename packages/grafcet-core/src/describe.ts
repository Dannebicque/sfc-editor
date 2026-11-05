import { indexOf } from './graph';
import type { Grafcet, Node } from './types';

/** Description structurée d'un élément ; l'interface en fait un texte localisé. */
export interface Description {
  key: string;
  params?: Record<string, number | string>;
  /** Nom de l'étape (affiché après « · »). */
  name?: string;
  initial?: boolean;
  /** Pour une transition : réceptivité (chaîne vide = non renseignée). */
  recept?: string;
  /** Pour un lien : nombre de branches. */
  branches?: number;
}

export function describe(it: Node): Description {
  return it.kind === 'step'
    ? { key: 'd_step', params: { n: it.num }, name: it.name, initial: it.initial }
    : { key: 'd_trans', params: { n: it.num }, recept: it.recept };
}

/** Description d'un id de sélection : élément, séquence vide (emplacement X), lien (barre) ou renvoi. */
export function describeId(g: Grafcet, id: string | null): Description | null {
  if (!id) return null;
  const ix = indexOf(g);
  const n = ix.node.get(id);
  if (n) return describe(n.item);
  const l = ix.link.get(id);
  if (l) return { key: (l.kind === 'div' ? 'div_' : 'conv_') + l.op, branches: l.nodes.length };
  const j = ix.jump.get(id);
  if (j) {
    const t = j.to ? ix.node.get(j.to) : undefined;
    if (!t) return { key: 'd_jump_none' };
    return { key: t.item.kind === 'step' ? 'd_jump_step' : 'd_jump_trans', params: { n: t.item.num } };
  }
  if (ix.seq.has(id)) return { key: 'd_seq_empty' };
  return null;
}
