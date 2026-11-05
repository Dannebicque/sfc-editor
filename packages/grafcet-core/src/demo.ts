import { nextId } from './insertion';
import type { Action, Block, Grafcet, Item, Project, Step, Transition } from './types';

/** Textes d'un projet de démonstration (fournis par l'interface, dans la langue choisie). */
export type DemoTexts = Record<
  | 'proj' | 'g1' | 'g2' | 'g3' | 's0' | 't1' | 's1' | 'a1' | 'tb' | 's2' | 'a2' | 't3' | 'tv' | 's3' | 'a3' | 't5'
  | 's4' | 'a4' | 'a4b' | 't6' | 's5' | 'a5' | 't7' | 's6' | 's7' | 'a7' | 't8' | 's8'
  | 'c0' | 'ct1' | 'c1' | 'ca1' | 'ct2' | 'c2' | 'ca2' | 'ct3',
  string
>;

/** Projet de démonstration : tri de pièces (divergences OU et ET, renvoi) et un cycle de vérin. Ids identiques dans toutes les langues. */
export function buildDemoProject(d: DemoTexts): Project {
  const P: Project = { name: d.proj, counter: 1, gcount: 1, grafcets: [] };
  const mk = (name: string, first: number): Grafcet => ({ id: 'g' + P.gcount++, name, nextStep: first, nextTrans: 1, items: [] });
  const S = (g: Grafcet, name: string, acts: (string | Action)[] = [], initial = false): Step => ({
    id: nextId(P), kind: 'step', num: g.nextStep++, name, initial,
    actions: acts.map((a) => (typeof a === 'string' ? { kind: 'continue', label: a, cond: '' } : a)),
  });
  const T = (g: Grafcet, recept: string): Transition => ({ id: nextId(P), kind: 'trans', num: g.nextTrans++, recept });

  const g1 = mk(d.g1, 0);
  const s0 = S(g1, d.s0, [], true), t1 = T(g1, d.t1), s1 = S(g1, d.s1, [d.a1]);
  const or: Block = { id: nextId(P), kind: 'or', branches: [[], []] };
  or.branches[0]!.push(T(g1, d.tb), S(g1, d.s2, [d.a2]), T(g1, d.t3));
  or.branches[1]!.push(T(g1, d.tv), S(g1, d.s3, [d.a3]), T(g1, d.t5));
  const s4 = S(g1, d.s4, [d.a4, { kind: 'conditional', label: d.a4b, cond: 'X4' }]);
  const t6 = T(g1, d.t6);
  const and: Block = { id: nextId(P), kind: 'and', branches: [[], []] };
  and.branches[0]!.push(S(g1, d.s5, [d.a5]), T(g1, d.t7), S(g1, d.s6));
  and.branches[1]!.push(S(g1, d.s7, [d.a7]), T(g1, d.t8), S(g1, d.s8));
  const t9 = T(g1, 'X6 . X8');
  const items: Item[] = [s0, t1, s1, or, s4, t6, and, t9, { id: nextId(P), kind: 'jump', target: s0.id }];
  g1.items = items;

  const g2 = mk(d.g2, 0);
  const a0 = S(g2, d.c0, [], true), ta = T(g2, d.ct1), a1 = S(g2, d.c1, [d.ca1]), tb = T(g2, d.ct2), a2 = S(g2, d.c2, [d.ca2]), tc = T(g2, d.ct3);
  g2.items = [a0, ta, a1, tb, a2, tc, { id: nextId(P), kind: 'jump', target: a0.id }];

  const g3 = mk(d.g3, 0);
  g3.items = [S(g3, '', [], true)];
  P.grafcets = [g1, g2, g3];
  return P;
}
