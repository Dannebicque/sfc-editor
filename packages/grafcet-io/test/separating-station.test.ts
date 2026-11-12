import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nodesOf, violations } from '@grafcet/core';
import { exportSfcEditXml, importSfcEditXml } from '../src';

const xml = readFileSync(new URL('../../../fixtures/sfcedit/separating-station.xml', import.meta.url), 'utf8');

describe('SFCEdit : Separating Station', () => {
  const { model, report } = importSfcEditXml(xml, { projectName: 'sep' });
  const gast = model.grafcets.find((g) => g.name === 'GAST')!;
  it('importe les 13 GRAFCET, tous valides sauf GAST', () => {
    expect(model.grafcets).toHaveLength(13);
    for (const g of model.grafcets.filter((x) => x.name !== 'GAST')) expect(violations(g)).toEqual([]);
  });
  it('GAST : le renvoi vers X30 (depuis un placeholder) devient des renvois directs', () => {
    const x30 = nodesOf(gast).find((n) => n.kind === 'step' && n.num === '30')!;
    const toX30 = gast.jumps.filter((j) => j.to === x30.id);
    expect(toX30).toHaveLength(5); // 4 branches de la convergence du bas + la branche issue de X0
    expect(report.entries.some((e) => e.message.key === 'rep_jump_resolved')).toBe(true);
  });
  it('GAST : renvois vers X2_1 et X6_5 portés par une branche vide de divergence ET', () => {
    const step = (n: string) => nodesOf(gast).find((x) => x.kind === 'step' && x.num === n)!;
    for (const n of ['X2_1', 'X6_5']) {
      const from = gast.jumps.filter((j) => j.to === step(n).id).map((j) => gast.seqs.find((q) => q.id === j.from)!);
      expect(from.some((q) => q.items.length === 0)).toBe(true);
    }
  });
  it('GAST est entièrement valide, sans erreur d\'import', () => {
    expect(violations(gast)).toEqual([]);
    expect(report.entries.filter((e) => e.level === 'error')).toEqual([]);
  });
  it('aller-retour SFCEdit : GAST reste valide', () => {
    const out = exportSfcEditXml(model).output;
    const again = importSfcEditXml(out, { projectName: 'sep' }).model.grafcets.find((g) => g.name === 'GAST')!;
    expect(violations(again)).toEqual([]);
    expect(again.jumps).toHaveLength(gast.jumps.length);
  });
});
