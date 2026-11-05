import { tidy } from './edit';
import type { Grafcet, HLink, Jump, Node, Project, Seq } from './types';

/** Ancien modèle (arbre de blocs, schéma natif 1.x), conservé uniquement pour lire les anciens fichiers. */
export type TreeItem = Node | { id: string; kind: 'jump'; target: string | null } | { id: string; kind: 'or' | 'and'; branches: TreeItem[][] };
export interface TreeGrafcet { id: string; name: string; comment?: string; nextStep: number; nextTrans: number; items: TreeItem[] }
export interface TreeProject { name: string; counter: number; gcount: number; grafcets: (TreeGrafcet | Grafcet)[] }

/** Convertit un GRAFCET en arbre (ancien format) en séquences + liens. Les ids d'éléments sont conservés. */
export function treeToGraph(t: TreeGrafcet, P: { counter: number }): Grafcet {
  const seqs: Seq[] = [], links: HLink[] = [], jumps: Jump[] = [];
  const mkSeq = (): Seq => { const s: Seq = { id: 'q' + P.counter++, items: [] }; seqs.push(s); return s; };
  const drop = (s: Seq) => seqs.splice(seqs.indexOf(s), 1);

  /** Ajoute `items` à la suite de `cur` ; renvoie la séquence qui porte la fin, ou null si le flux s'arrête (renvoi). */
  function walk(items: TreeItem[], cur: Seq): Seq | null {
    let c: Seq | null = cur;
    for (const it of items) {
      if (!c) return null;
      if (it.kind === 'step' || it.kind === 'trans') c.items.push(it);
      else if (it.kind === 'jump') {
        if (c.items.length && it.target) jumps.push({ id: 'j' + P.counter++, from: c.id, to: it.target });
        return null;
      } else {
        const kids = it.branches.map((b) => { const k = mkSeq(); const end = walk(b, k); return { k, end, jumpOnly: !k.items.length && b[b.length - 1]?.kind === 'jump' }; });
        const live = kids.filter((x) => !x.jumpOnly);
        for (const x of kids) if (x.jumpOnly) drop(x.k);
        if (live.length >= 2) links.push({ id: 'l' + P.counter++, kind: 'div', op: it.kind, base: c.id, nodes: live.map((x) => x.k.id) });
        else if (live.length === 1) { const k = live[0]!; c.items.push(...k.k.items); for (const j of jumps) if (j.from === k.k.id) j.from = c.id; drop(k.k); live[0] = { ...k, k: c, end: k.end ? c : null }; }
        const ends = live.filter((x) => x.end && !(it.kind === 'and' && x.end.items[x.end.items.length - 1]?.kind === 'trans')).map((x) => x.end!);
        if (ends.length >= 2) {
          const next = mkSeq();
          links.push({ id: 'l' + P.counter++, kind: 'conv', op: it.kind, base: next.id, nodes: ends.map((e) => e.id) });
          c = next;
        } else if (ends.length === 1) c = ends[0]!;
        else return null;
      }
    }
    return c;
  }
  walk(t.items, mkSeq());
  const g: Grafcet = { id: t.id, name: t.name, nextStep: t.nextStep, nextTrans: t.nextTrans, seqs, links, jumps };
  if (t.comment !== undefined) g.comment = t.comment;
  tidy(g);
  return g;
}

/** Convertit tous les GRAFCET d'un projet encore au format arbre. */
export function migrateProject(p: TreeProject): Project {
  const P: Project = { name: p.name, counter: p.counter, gcount: p.gcount, grafcets: [] };
  P.grafcets = p.grafcets.map((g) => ('items' in g ? treeToGraph(g, P) : g));
  return P;
}
