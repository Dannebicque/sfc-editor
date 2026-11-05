import { describe, expect, it } from 'vitest';
import { layoutGrafcet } from '../src';
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
