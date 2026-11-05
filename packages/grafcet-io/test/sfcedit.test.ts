import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { walkAll, type Item, type Project } from '@grafcet/core';
import { exportSfcEditXml, importSfcEditXml, looksLikeSfcEditXml } from '../src';

const xml = readFileSync(new URL('../../../fixtures/sfcedit/convergence-et-renvoi.xml', import.meta.url), 'utf8');

const shape = (items: Item[]): unknown[] => items.map((i) =>
  i.kind === 'step' ? `S${i.num}${i.initial ? '*' : ''}:${i.actions.map((a) => a.label).join(',')}`
  : i.kind === 'trans' ? `T:${i.recept}`
  : i.kind === 'jump' ? 'J'
  : { [i.kind]: i.branches.map(shape) });

describe('SFCEdit XML', () => {
  const { model, report } = importSfcEditXml(xml, { projectName: 'test' });
  it('détecte le format', () => { expect(looksLikeSfcEditXml(xml)).toBe(true); expect(looksLikeSfcEditXml('{}')).toBe(false); });
  it('importe deux grafcets sans erreur', () => {
    expect(model.grafcets.map((g) => g.name)).toEqual(['Grafcet', 'Grafcet1']);
    expect(report.entries.filter((e) => e.level === 'error')).toEqual([]);
  });
  it('reconstruit la structure', () => {
    const s = shape(model.grafcets[0]!.items) as any[];
    expect(s.slice(0, 3)).toEqual(['S0*:', 'T:Auto', expect.any(Object)]);
    expect(s[2].and).toHaveLength(2);
    expect(s.slice(3)).toEqual(['T:1', 'J']);
    const g1 = shape(model.grafcets[1]!.items);
    expect(g1).toEqual(['S15*:', 'T:X2+X9', 'S16:', 'T:(X4+X11)./At_exit', 'J']);
  });
  it('renvoie vers la première étape', () => {
    const g = model.grafcets[0]!;
    const jump = g.items.at(-1) as Extract<Item, { kind: 'jump' }>;
    expect(jump.target).toBe(g.items[0]!.id);
  });
  it('aller-retour stable', () => {
    const out = exportSfcEditXml(model);
    const again = importSfcEditXml(out.output, { projectName: 'test' }).model as Project;
    expect(again.grafcets.map((g) => shape(g.items))).toEqual(model.grafcets.map((g) => shape(g.items)));
    expect(out.report.entries.filter((e) => e.level === 'error')).toEqual([]);
  });
  it('numérote les transitions', () => {
    const nums: number[] = [];
    walkAll(model.grafcets[0]!.items, (i) => { if (i.kind === 'trans') nums.push(i.num); });
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });
});

describe('action sur événement', () => {
  it('survit à un aller-retour SFCEdit', () => {
    const project = importSfcEditXml(xml, { projectName: "p" }).model;
    const s = project.grafcets[0]!.items.find((i) => i.kind === 'step')! as { actions: { kind: string; label: string; cond: string }[] };
    s.actions = [{ kind: 'event', label: 'B:=1', cond: '↑a' }];
    const back = importSfcEditXml(exportSfcEditXml(project).output, { projectName: "p" }).model;
    const t = back.grafcets[0]!.items.find((i) => i.kind === 'step')! as { actions: { kind: string; cond: string }[] };
    expect(t.actions[0]).toMatchObject({ kind: 'event', cond: '↑a' });
  });
});
