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
