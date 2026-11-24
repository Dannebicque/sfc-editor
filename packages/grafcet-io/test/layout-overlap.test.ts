import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutGrafcet } from '../../grafcet-layout/src';
import { importSfcEditXml } from '../src';

/** Aucune étape ni transition ne doit être traversée par la barre d'un lien qui ne la concerne pas. */
describe('mise en page du Separating Station', () => {
  const { model } = importSfcEditXml(readFileSync(new URL('../../../fixtures/sfcedit/separating-station.xml', import.meta.url), 'utf8'), { projectName: 'x' });
  for (const g of model.grafcets) {
    it(`${g.name} : aucune barre ne traverse une étape ou une transition`, () => {
      const lay = layoutGrafcet(g, (s) => s.length * 9);
      const bars = lay.views.flatMap((v) => (v.kind === 'bar' ? [v] : []));
      const hits: string[] = [];
      for (const v of lay.views) {
        if (v.kind !== 'step' && v.kind !== 'trans') continue;
        const hw = v.kind === 'step' ? 22 : 12, hh = v.kind === 'step' ? 38 : 8;
        for (const b of bars) for (const y of b.ys) if (y > v.y + 2 && y < v.y + hh && v.x + hw > b.x1 && v.x - hw < b.x2) hits.push(`${v.kind} ${v.id} / barre y=${y}`);
      }
      expect(hits).toEqual([]);
    });
  }
});
