import { findItem } from './tree';
import type { Grafcet, Item } from './types';

/** Description structurée d'un élément ; l'interface en fait un texte localisé. */
export interface Description {
  key: string;
  params?: Record<string, number | string>;
  /** Nom de l'étape (affiché après « · »). */
  name?: string;
  initial?: boolean;
  /** Pour une transition : réceptivité (chaîne vide = non renseignée). */
  recept?: string;
  /** Pour une barre de divergence : nombre de branches. */
  branches?: number;
}

export function describe(it: Item, g: Grafcet): Description {
  switch (it.kind) {
    case 'step': return { key: 'd_step', params: { n: it.num }, name: it.name, initial: it.initial };
    case 'trans': return { key: 'd_trans', params: { n: it.num }, recept: it.recept };
    case 'jump': {
      const t = it.target ? findItem(g.items, it.target) : null;
      if (!t) return { key: 'd_jump_none' };
      return { key: t.kind === 'step' ? 'd_jump_step' : 'd_jump_trans', params: { n: (t as { num: string | number }).num } };
    }
    default: return { key: it.kind === 'or' ? 'd_block_or' : 'd_block_and' };
  }
}

/** Description d'un id de sélection (les ids terminés par « :d » désignent la barre de divergence). */
export function describeId(g: Grafcet, id: string | null): Description | null {
  if (!id) return null;
  const base = id.replace(':d', '');
  const it = findItem(g.items, base);
  if (!it) return null;
  if (it.kind === 'or' || it.kind === 'and') {
    const div = id.endsWith(':d');
    const key = (div ? 'div_' : 'conv_') + it.kind;
    return div ? { key, branches: it.branches.length } : { key };
  }
  return describe(it, g);
}
