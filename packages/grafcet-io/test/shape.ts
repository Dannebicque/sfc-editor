import { docOrder, type Grafcet, type Node } from '@grafcet/core';

const item = (i: Node) => i.kind === 'step' ? `S${i.num}${i.initial ? '*' : ''}:${i.actions.map((a) => a.kind[0] + a.label + (a.cond ? '?' + a.cond : '')).join(',')}` : `T:${i.recept}`;

/** Forme canonique d'un GRAFCET (indépendante des ids) : séquences dans l'ordre du document, liens et renvois par indices. */
export function shape(g: Grafcet) {
  const order = docOrder(g);
  const at = (id: string | null) => (id === null ? '-' : String(order.findIndex((s) => s.id === id)));
  const where = (id: string | null) => { for (const s of g.seqs) { const k = s.items.findIndex((i) => i.id === id); if (k >= 0) return `${at(s.id)}.${k}`; } return '?'; };
  return {
    seqs: order.map((s) => s.items.map(item)),
    links: g.links.map((l) => `${l.kind} ${l.op} ${at(l.base)} [${l.nodes.map(at).join(',')}]`).sort(),
    jumps: g.jumps.map((j) => `${at(j.from)}->${where(j.to)}`).sort(),
  };
}
