import { describe, expect, it } from 'vitest';
import type { Grafcet, Node } from '@grafcet/core';
import { layoutGrafcet, type BarView, type StepView, type TransView } from '../src';
import { demoProject } from '../../grafcet-core/test/helpers';

const tw = (s: string) => s.length * 7;
const S = (id: string, n: string, initial = false): Node => ({ id, kind: 'step', num: n, name: '', initial, actions: [] });
const T = (id: string, n: number, recept = 'a'): Node => ({ id, kind: 'trans', num: n, recept });
const G = (seqs: [string, Node[]][], links: Grafcet['links'] = [], jumps: Grafcet['jumps'] = []): Grafcet =>
  ({ id: 'g', name: 'g', nextStep: 99, nextTrans: 99, seqs: seqs.map(([id, items]) => ({ id, items })), links, jumps });
const finite = (g: Grafcet) => { const L = layoutGrafcet(g, tw); for (const l of L.lines) for (const v of Object.values(l)) expect(Number.isFinite(v)).toBe(true); return L; };
const box = (v: StepView | TransView) => ({ id: v.id, x1: v.x - v.l, x2: v.x + v.r, y1: v.ay, y2: v.y + v.h });
/** Vrai si deux éléments (étapes/transitions) se chevauchent à l'écran. */
const overlaps = (g: Grafcet) => {
  const bs = layoutGrafcet(g, tw).views.filter((v): v is StepView | TransView => v.kind === 'step' || v.kind === 'trans').map(box);
  const bad: string[] = [];
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i]!, b = bs[j]!;
    if (a.x1 < b.x2 - 1 && b.x1 < a.x2 - 1 && a.y1 < b.y2 - 1 && b.y1 < a.y2 - 1) bad.push(a.id + '/' + b.id);
  }
  return bad;
};

describe('mise en page', () => {
  it('est déterministe et ne produit que des coordonnées finies', () => {
    const g = demoProject().grafcets[0]!;
    const a = layoutGrafcet(g, tw), b = layoutGrafcet(g, tw);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    finite(g);
  });
  it('produit un point d’ancrage par élément, par barre et par renvoi', () => {
    const g = demoProject().grafcets[0]!;
    const lay = layoutGrafcet(g, tw);
    const ids = new Set(lay.focus.map((f) => f.id));
    expect(ids.size).toBe(lay.focus.length);
    expect(lay.focus.length).toBe(g.seqs.reduce((n, s) => n + s.items.length, 0) + g.links.length + g.jumps.length);
  });
  it('les bornes contiennent toutes les étapes, sans chevauchement', () => {
    for (const g of demoProject().grafcets) {
      const lay = layoutGrafcet(g, tw);
      for (const v of lay.views) if (v.kind === 'step') {
        expect(v.x - v.l).toBeGreaterThanOrEqual(lay.bounds.x - 0.001);
        expect(v.x + v.r).toBeLessThanOrEqual(lay.bounds.x + lay.bounds.w + 0.001);
      }
      expect(overlaps(g)).toEqual([]);
    }
  });
  it('divergence : barre sous la base, branches côte à côte ; convergence sous la plus basse', () => {
    const g = demoProject().grafcets[0]!;
    const L = layoutGrafcet(g, tw);
    const bar = (id: string) => L.views.find((v) => v.kind === 'bar' && v.id === id) as BarView;
    const [div, conv] = [bar(g.links[0]!.id), bar(g.links[1]!.id)];
    expect(conv.ys[0]!).toBeGreaterThan(div.ys[0]!);
    expect(div.x2 - div.x1).toBeGreaterThan(60);
    const trans = (id: string) => L.views.find((v) => v.id === id) as TransView;
    const b1 = trans(g.seqs[1]!.items[0]!.id), b2 = trans(g.seqs[2]!.items[0]!.id);
    expect(b1.y).toBe(b2.y);
    expect(b2.x).toBeGreaterThan(b1.x);
  });
  it('tient dans des temps raisonnables à 100 étapes', () => {
    const items: Node[] = [];
    for (let i = 0; i < 50; i++) items.push(S('s' + i, String(i), i === 0), T('t' + i, i + 1));
    const t0 = performance.now();
    layoutGrafcet(G([['q', items]], [], [{ id: 'j', from: 'q', to: 's0' }]), tw);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('renvois', () => {
  it('affiche au-dessus de la cible les étapes d’où part le renvoi', () => {
    const g = G([['q', [S('s0', '0', true), T('t1', 1), S('s1', '1'), T('t2', 2), S('s2', '2'), T('t3', 3)]]], [], [{ id: 'j', from: 'q', to: 's0' }]);
    const l = layoutGrafcet(g, tw);
    const s0 = l.views.find((v) => v.id === 's0') as StepView;
    expect(s0.arrivals).toEqual(['2']);
    expect(s0.y).toBeGreaterThan(s0.ay);
    expect((l.views.find((v) => v.id === 's1') as StepView).arrivals).toEqual([]);
  });
  it('signale tous les renvois sur l’étape cible, même depuis plusieurs branches', () => {
    const g = G([
      ['a', [S('s0', '2_1', true), T('t1', 1), S('s1', '1')]],
      ['b', [T('t2', 2)]], ['c', [T('t3', 3), S('s3', '3'), T('t4', 4)]],
    ], [{ id: 'l', kind: 'div', op: 'or', base: 'a', nodes: ['b', 'c'] }], [{ id: 'j1', from: 'b', to: 's0' }, { id: 'j2', from: 'c', to: 's0' }]);
    const s0 = layoutGrafcet(g, tw).views.find((v) => v.id === 's0') as StepView;
    expect(s0.arrivals).toEqual(['1', '3']);
  });
});

describe('séquences libres, liens ouverts, X', () => {
  it('place une transition source, une transition puits et un emplacement vide', () => {
    const L = finite(G([['q', [T('a', 1), S('b', '1'), T('c', 2)]], ['x', []]]));
    expect(L.views.filter((v) => v.kind === 'trans')).toHaveLength(2);
    expect(L.views.some((v) => v.kind === 'seq')).toBe(true);
  });
  it('convergence ET ouverte de deux séquences indépendantes', () => {
    const g = G([['a', [S('s1', '1', true), T('t1', 1), S('s2', '2')]], ['b', [S('s3', '3', true)]]], [{ id: 'l', kind: 'conv', op: 'and', base: null, nodes: ['a', 'b'] }]);
    const L = finite(g);
    const bar = L.views.find((v) => v.kind === 'bar') as BarView;
    expect(bar.open).toBe(true);
    expect(bar.ys).toHaveLength(2);
    expect(overlaps(g)).toEqual([]);
  });
  it('convergence entre branches de divergences différentes : aucun chevauchement', () => {
    // 1_2 et 5_6 divergent en OU ; une branche de chacune converge en ET vers 30 (schéma d'exemple)
    const g = G([
      ['a', [S('s1', '1_2', true)]], ['a1', [T('t1', 1), S('s9', '9'), T('t2', 2)]], ['a2', [T('t3', 3), S('s10', '10')]],
      ['b', [S('s5', '5_6', true)]], ['b1', [T('t4', 4), S('s11', '11'), T('t5', 5)]], ['b2', [T('t6', 6), S('s12', '12')]],
      ['c', [T('t7', 7), S('s30', '30'), T('t8', 8)]],
    ], [
      { id: 'l1', kind: 'div', op: 'or', base: 'a', nodes: ['a1', 'a2'] }, { id: 'l2', kind: 'div', op: 'or', base: 'b', nodes: ['b1', 'b2'] },
      { id: 'l3', kind: 'conv', op: 'and', base: 'c', nodes: ['a2', 'b2'] },
    ], [{ id: 'j1', from: 'a1', to: 's1' }, { id: 'j2', from: 'b1', to: 's5' }, { id: 'j3', from: 'c', to: 's30' }]);
    finite(g);
    expect(overlaps(g)).toEqual([]);
    const L = layoutGrafcet(g, tw);
    const conv = L.views.find((v) => v.kind === 'bar' && v.id === 'l3') as BarView;
    const s10 = L.views.find((v) => v.id === 's10') as StepView, s12 = L.views.find((v) => v.id === 's12') as StepView;
    expect(conv.ys[0]!).toBeGreaterThan(Math.max(s10.y, s12.y));
    const t7 = L.views.find((v) => v.id === 't7') as TransView;
    expect(t7.y).toBeGreaterThan(conv.ys[1]!);
  });
  it('sépare la barre OU de la barre ET qui la suit', () => {
    const g = G([
      ['a', [S('s0', '0', true)]], ['b', [T('t1', 1)]], ['c', [T('t2', 2)]],
      ['d', [S('s1', '1')]], ['e', [S('s2', '2')]], ['f', [T('t9', 9)]],
    ], [
      { id: 'o', kind: 'div', op: 'or', base: 'a', nodes: ['b', 'c'] }, { id: 'a1', kind: 'div', op: 'and', base: 'b', nodes: ['d', 'e'] },
    ]);
    const L = layoutGrafcet(g, tw);
    const or = L.views.find((v) => v.kind === 'bar' && v.id === 'o') as BarView, and = L.views.find((v) => v.kind === 'bar' && v.id === 'a1') as BarView;
    expect(and.ys[0]! - or.ys[0]!).toBeGreaterThanOrEqual(12);
  });
});

describe('actions liées à une transition', () => {
  it('place les actions à droite de la réceptivité', () => {
    const t = { ...(T('t1', 1, 'abc') as Extract<Node, { kind: 'trans' }>), actions: [{ kind: 'event' as const, label: 'B:=0', cond: 'X5' }] };
    const L = layoutGrafcet(G([['q', [S('s0', '0', true), t, S('s1', '1')]]]), tw);
    const v = L.views.find((x) => x.kind === 'trans') as TransView;
    expect(v.acts).toHaveLength(1);
    expect(v.acts[0]!.x).toBeGreaterThan(v.x + 7 * 3);
    expect(v.acts[0]!.cell).toBe(true);
  });
});
