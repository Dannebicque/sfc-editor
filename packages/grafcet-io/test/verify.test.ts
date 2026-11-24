import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nodesOf } from '@grafcet/core';
import { checkSfcEditImport, exportSfcEditXml, importSfcEditXml } from '../src';

const read = (n: string) => readFileSync(new URL(`../../../fixtures/sfcedit/${n}`, import.meta.url), 'utf8');

describe('contrôle d\'un import SFCEdit', () => {
  for (const f of ['separating-station.xml', 'convergence-et-renvoi.xml']) {
    it(`${f} : l'import est conforme au XML, et son réexport aussi`, () => {
      const xml = read(f);
      const { model } = importSfcEditXml(xml, { projectName: 'x' });
      expect(checkSfcEditImport(xml, model).filter((r) => !r.ok)).toEqual([]);
      const out = exportSfcEditXml(model).output;
      const again = importSfcEditXml(out, { projectName: 'x' }).model;
      expect(checkSfcEditImport(out, again).filter((r) => !r.ok)).toEqual([]);
    });
  }
  it('détecte une réceptivité modifiée, une action perdue, un renvoi supprimé et un drapeau task retiré', () => {
    const xml = read('separating-station.xml');
    const { model } = importSfcEditXml(xml, { projectName: 'x' });
    const run = (mutate: (m: typeof model) => void) => {
      const m = structuredClone(model);
      mutate(m);
      return checkSfcEditImport(xml, m).filter((r) => !r.ok);
    };
    const t = (m: typeof model) => nodesOf(m.grafcets.find((g) => g.name === 'GT1')!);
    expect(run((m) => { const x = t(m).find((n) => n.kind === 'trans')!; if (x.kind === 'trans') x.recept += '.z'; })).toHaveLength(1);
    expect(run((m) => { const x = t(m).find((n) => n.kind === 'step' && n.actions.length)!; if (x.kind === 'step') x.actions.pop(); })).toHaveLength(1);
    expect(run((m) => { m.grafcets.find((g) => g.name === 'GAST')!.jumps.pop(); })).toHaveLength(1);
    expect(run((m) => { const x = nodesOf(m.grafcets.find((g) => g.name === 'GAST')!).find((n) => n.kind === 'step' && n.task)!; if (x.kind === 'step') delete x.task; })).toHaveLength(1);
  });
});

describe('équations', () => {
  it('toutes les conditions du fixture gardent la même table de vérité', async () => {
    const { checkEquations } = await import('../src/verify');
    const r = checkEquations(read('separating-station.xml'));
    expect(r.checked).toBeGreaterThan(80);
    expect(r.bad).toEqual([]);
  });
  it('détecte une équation altérée (barre mal placée, ET/OU inversés)', async () => {
    const { sameEquation } = await import('../src/verify');
    expect(sameEquation(['¬', '(', 'a', '+', 'b', ')'], ['¬', 'a', '+', 'b'])).toBe(false);
    expect(sameEquation(['a', '.', 'b', '+', 'c'], ['a', '.', '(', 'b', '+', 'c', ')'])).toBe(false);
    expect(sameEquation(['¬', '(', 'a', '+', 'b', ')'], ['¬', 'a', '.', '¬', 'b'])).toBe(true);
  });
});

describe('libellés d\'action', () => {
  it('les négations d\'un libellé (<cpl>) survivent à l\'import et à l\'aller-retour', () => {
    const xml = read('separating-station.xml');
    const { model } = importSfcEditXml(xml, { projectName: 'x' });
    const labels = model.grafcets.find((g) => g.name === 'GAST')!.seqs.flatMap((s) => s.items).flatMap((n) => n.kind === 'trans' ? (n.actions ?? []).map((a) => a.label) : []);
    expect(labels).toContain('flag1c1:=p1_blue.blue1+/p1_blue./blue1');
    const back = importSfcEditXml(exportSfcEditXml(model).output, { projectName: 'x' }).model;
    expect(JSON.stringify(back.grafcets.find((g) => g.name === 'GAST'))).toContain('flag1c1:=p1_blue.blue1+/p1_blue./blue1');
  });
});
