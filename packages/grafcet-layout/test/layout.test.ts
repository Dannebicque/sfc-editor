import { describe, expect, it } from 'vitest';
import type { Grafcet } from '@grafcet/core';
import { layoutGrafcet, type StepView } from '../src';
import { demoProject } from '../../grafcet-core/test/helpers';

const tw = (s: string) => s.length * 7;

describe('mise en page', () => {
  it('est déterministe et ne produit que des coordonnées finies', () => {
    const g = demoProject().grafcets[0]!;
    const a = layoutGrafcet(g, tw), b = layoutGrafcet(g, tw);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const l of a.lines) for (const v of Object.values(l)) expect(Number.isFinite(v)).toBe(true);
  });
  it('produit un point d’ancrage par élément et par barre de divergence', () => {
    const g = demoProject().grafcets[0]!;
    const lay = layoutGrafcet(g, tw);
    const ids = new Set(lay.focus.map((f) => f.id));
    expect(ids.size).toBe(lay.focus.length);
    expect([...ids].filter((i) => i.endsWith(':d')).length).toBe(2);
  });
  it('les bornes contiennent toutes les étapes', () => {
    const lay = layoutGrafcet(demoProject().grafcets[0]!, tw);
    for (const v of lay.views) if (v.kind === 'step') {
      expect(v.x - v.l).toBeGreaterThanOrEqual(lay.bounds.x - 0.001);
      expect(v.x + v.r).toBeLessThanOrEqual(lay.bounds.x + lay.bounds.w + 0.001);
    }
  });
  it('tient dans des temps raisonnables à 100 étapes', () => {
    const g = demoProject().grafcets[1]!;
    const base = g.items.slice(0, -1);
    const items = [] as typeof g.items;
    for (let i = 0; i < 17; i++) for (const it of base) items.push({ ...it, id: it.id + '_' + i } as never);
    items.push({ id: 'jj', kind: 'jump', target: items[0]!.id });
    const t0 = performance.now();
    layoutGrafcet({ ...g, items }, tw);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('arrivée des renvois', () => {
  it('affiche au-dessus de la cible les étapes d’où part le renvoi', () => {
    const g: Grafcet = {
      id: 'g1', name: 'g', nextStep: 3, nextTrans: 2,
      items: [
        { id: 's0', kind: 'step', num: '0', name: '', initial: true, actions: [] },
        { id: 't1', kind: 'trans', num: 1, recept: 'a' },
        { id: 's1', kind: 'step', num: '1', name: '', initial: false, actions: [] },
        { id: 't2', kind: 'trans', num: 2, recept: 'b' },
        { id: 's2', kind: 'step', num: '2', name: '', initial: false, actions: [] },
        { id: 't3', kind: 'trans', num: 3, recept: 'c' },
        { id: 'j', kind: 'jump', target: 's0' },
      ],
    };
    const l = layoutGrafcet(g, (s) => s.length * 7);
    const s0 = l.views.find((v) => v.id === 's0') as StepView;
    expect(s0.arrivals).toEqual(['2']);
    expect(s0.y).toBeGreaterThan(s0.ay);
    const s1 = l.views.find((v) => v.id === 's1') as StepView;
    expect(s1.arrivals).toEqual([]);
    expect(s1.ay).toBe(s1.y);
  });
});

describe('transition source et puits', () => {
  it('place une transition en tête et en queue avec des coordonnées finies', () => {
    const g = {
      id: 'g', name: 'g', nextStep: 2, nextTrans: 3,
      items: [
        { id: 'a', kind: 'trans', num: 1, recept: 'a' },
        { id: 'b', kind: 'step', num: '1', name: '', initial: false, actions: [] },
        { id: 'c', kind: 'trans', num: 2, recept: 'b' },
      ],
    } as unknown as Grafcet;
    const L = layoutGrafcet(g, tw);
    for (const l of L.lines) for (const v of Object.values(l)) expect(Number.isFinite(v)).toBe(true);
    expect(L.views.filter((v) => v.kind === 'trans')).toHaveLength(2);
  });
});

describe('OU enchaîné sur un ET', () => {
  it('produit une mise en page finie', () => {
    const S = (id: string, n: string, initial = false) => ({ id, kind: 'step', num: n, name: '', initial, actions: [] });
    const T = (id: string, n: number) => ({ id, kind: 'trans', num: n, recept: 'a' });
    const g = { id: 'g', name: 'g', nextStep: 9, nextTrans: 9, items: [
      S('s0', '0', true),
      { id: 'o', kind: 'or', branches: [
        [{ id: 'a', kind: 'and', branches: [[S('s1', '1')], [S('s2', '2')]] }, T('t9', 9)],
        [T('t1', 1), S('s3', '3'), T('t5', 5)],
      ] },
      S('s7', '7'), T('t0', 0),
    ] } as unknown as Grafcet;
    const L = layoutGrafcet(g, tw);
    for (const l of L.lines) for (const v of Object.values(l)) expect(Number.isFinite(v)).toBe(true);
    expect(L.views.filter((v) => v.kind === 'step')).toHaveLength(5);
  });
});

describe('actions liées à une transition', () => {
  it('place les actions à droite de la réceptivité', () => {
    const g = { id: 'g', name: 'g', nextStep: 3, nextTrans: 3, items: [
      { id: 's0', kind: 'step', num: '0', name: '', initial: true, actions: [] },
      { id: 't1', kind: 'trans', num: 1, recept: 'abc', actions: [{ kind: 'event', label: 'B:=0', cond: 'X5' }] },
      { id: 's1', kind: 'step', num: '1', name: '', initial: false, actions: [] },
    ] } as unknown as Grafcet;
    const L = layoutGrafcet(g, tw);
    const t = L.views.find((v) => v.kind === 'trans') as { acts: { x: number; cell: boolean }[]; x: number };
    expect(t.acts).toHaveLength(1);
    expect(t.acts[0]!.x).toBeGreaterThan(t.x + 7 * 3);
    expect(t.acts[0]!.cell).toBe(true);
  });
});

describe('renvois dans des branches', () => {
  const S = (id: string, n: string, initial = false) => ({ id, kind: 'step', num: n, name: '', initial, actions: [] });
  const T = (id: string, n: number) => ({ id, kind: 'trans', num: n, recept: 'a' });
  const g = { id: 'g', name: 'g', nextStep: 9, nextTrans: 9, items: [
    S('s0', '2_1', true), T('t1', 1), S('s1', '1'),
    { id: 'o', kind: 'or', branches: [
      [T('t2', 2), { id: 'j1', kind: 'jump', target: 's0' }],
      [{ id: 'a', kind: 'and', branches: [[S('s3', '3')], [{ id: 'j2', kind: 'jump', target: 's0' }]] }, T('t3', 3)],
    ] },
    S('s2', '2'), T('t4', 4),
  ] } as unknown as Grafcet;
  it('signale tous les renvois sur l’étape cible, même depuis une branche', () => {
    const s0 = layoutGrafcet(g, tw).views.find((v) => v.kind === 'step' && v.id === 's0') as StepView;
    expect(s0.arrivals).toEqual(['1']);
  });
  it('sépare la barre OU de la barre ET qui la suit', () => {
    const L = layoutGrafcet(g, tw);
    const bars = L.views.filter((v) => v.kind === 'bar' && (v.id === 'o' || v.id === 'a') && v.part === 'd') as { id: string; ys: number[] }[];
    const or = bars.find((b) => b.id === 'o')!, and = bars.find((b) => b.id === 'a')!;
    expect(and.ys[0]! - or.ys[0]!).toBeGreaterThanOrEqual(12);
  });
});

describe('synchronisation', () => {
  it('affiche les étapes attendues comme arrivées de la transition', () => {
    const S = (id: string, n: string, initial = false) => ({ id, kind: 'step', num: n, name: '', initial, actions: [] });
    const g = { id: 'g', name: 'g', nextStep: 9, nextTrans: 9, items: [
      S('a', '2A', true), { id: 't1', kind: 'trans', num: 1, recept: 'x' }, S('b', '30'),
      { id: 't2', kind: 'trans', num: 2, recept: 'y', sync: ['a'] }, S('c', '3'),
    ] } as unknown as Grafcet;
    const t = layoutGrafcet(g, tw).views.find((v) => v.kind === 'trans' && v.id === 't2') as { arrivals: string[]; sync: boolean };
    expect(t.sync).toBe(true);
    expect(t.arrivals).toEqual(['2A']);
  });
});
