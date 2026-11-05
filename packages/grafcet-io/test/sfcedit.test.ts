import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkGraph, docOrder, nodesOf, type Grafcet, type Project } from '@grafcet/core';
import { exportSfcEditXml, importSfcEditXml, looksLikeSfcEditXml } from '../src';
import { shape } from './shape';

const xml = readFileSync(new URL('../../../fixtures/sfcedit/convergence-et-renvoi.xml', import.meta.url), 'utf8');
const errors = (r: { report: { entries: { level: string }[] } }) => r.report.entries.filter((e) => e.level === 'error');

describe('SFCEdit XML', () => {
  const { model, report } = importSfcEditXml(xml, { projectName: 'test' });
  it('détecte le format', () => { expect(looksLikeSfcEditXml(xml)).toBe(true); expect(looksLikeSfcEditXml('{}')).toBe(false); });
  it('importe deux grafcets sans erreur', () => {
    expect(model.grafcets.map((g) => g.name)).toEqual(['Grafcet', 'Grafcet1']);
    expect(report.entries.filter((e) => e.level === 'error')).toEqual([]);
    for (const g of model.grafcets) expect(checkGraph(g)).toBeNull();
  });
  it('reprend les séquences, liens et renvois tels quels', () => {
    const s = shape(model.grafcets[0]!);
    expect(s.seqs).toHaveLength(4);
    expect(s.seqs[0]).toEqual(['S0*:', 'T:Auto']);
    expect(s.seqs[3]).toEqual(['T:1']);
    expect(s.links).toEqual(['conv and 3 [1,2]', 'div and 0 [1,2]']);
    expect(s.jumps).toEqual(['3->0.0']);
    expect(shape(model.grafcets[1]!).seqs).toEqual([['S15*:', 'T:X2+X9', 'S16:', 'T:(X4+X11)./At_exit']]);
  });
  it('renvoie vers la première étape', () => {
    const g = model.grafcets[0]!;
    expect(g.jumps[0]!.to).toBe(docOrder(g)[0]!.items[0]!.id);
  });
  it('aller-retour stable', () => {
    const out = exportSfcEditXml(model);
    const again = importSfcEditXml(out.output, { projectName: 'test' }).model as Project;
    expect(again.grafcets.map(shape)).toEqual(model.grafcets.map(shape));
    expect(out.report.entries.filter((e) => e.level === 'error')).toEqual([]);
  });
  it('numérote les transitions', () => {
    const nums = docOrder(model.grafcets[0]!).flatMap((s) => s.items).filter((i) => i.kind === 'trans').map((i) => i.num as number);
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });
});

describe('liens ouverts et séquences vides', () => {
  const open = `<?xml version="1.0"?><project><grafcet type="normal" owner="" name="G" comment="">
    <sequence id="1"><step type="initial" name="X1"/><transition><condition>a</condition></transition></sequence>
    <sequence id="2"><step type="normal" name="X2"/><transition><condition>b</condition></transition></sequence>
    <sequence id="3"><step type="normal" name="X3"/></sequence>
    <sequence id="4"/>
    <hlink type="conv or"><node seqid="1"/><node seqid="2"/></hlink>
    <hlink type="div and" seqid="3"><node seqid="4"/><node seqid="4"/></hlink>
  </grafcet></project>`;
  it('conserve une convergence sans aval', () => {
    const g = importSfcEditXml(open.replace(/<hlink type="div and"[\s\S]*?<\/hlink>/, ''), { projectName: 'p' }).model.grafcets[0]!;
    expect(g.links).toHaveLength(1);
    expect(g.links[0]).toMatchObject({ kind: 'conv', op: 'or', base: null });
    expect(g.seqs.some((s) => !s.items.length)).toBe(true);
    const again = importSfcEditXml(exportSfcEditXml({ name: 'p', counter: 1, gcount: 1, grafcets: [g] }).output, { projectName: 'p' }).model.grafcets[0]!;
    expect(shape(again)).toEqual(shape(g));
  });
});

describe('cas d’édition', () => {
  const roundtrip = (mut: (g: Grafcet) => void) => {
    const project = importSfcEditXml(xml, { projectName: 'p' }).model;
    mut(project.grafcets[0]!);
    const r = importSfcEditXml(exportSfcEditXml(project).output, { projectName: 'p' });
    expect(errors(r)).toEqual([]);
    return { before: shape(project.grafcets[0]!), after: shape(r.model.grafcets[0]!) };
  };
  it('action sur événement', () => {
    const project = importSfcEditXml(xml, { projectName: 'p' }).model;
    const s = docOrder(project.grafcets[0]!).flatMap((x) => x.items).find((i) => i.kind === 'step')! as { actions: unknown[] };
    s.actions = [{ kind: 'event', label: 'B:=1', cond: '↑a' }];
    const back = importSfcEditXml(exportSfcEditXml(project).output, { projectName: 'p' }).model;
    expect((docOrder(back.grafcets[0]!).flatMap((x) => x.items).find((i) => i.kind === 'step')! as { actions: { kind: string; cond: string }[] }).actions[0]).toMatchObject({ kind: 'event', cond: '↑a' });
  });
  it('transitions source et puits', () => {
    const { before, after } = roundtrip((g) => {
      g.seqs = [{ id: 'q', items: [{ id: 'q1', kind: 'trans', num: 1, recept: 'a' }, { id: 'q2', kind: 'step', num: '1', name: '', initial: false, actions: [] }, { id: 'q3', kind: 'trans', num: 2, recept: 'b' }] }];
      g.links = []; g.jumps = [];
    });
    expect(after.seqs).toEqual([['T:a', 'S1:', 'T:b']]);
    expect(after).toEqual(before);
  });
  it('convergence entre branches de divergences différentes', () => {
    const { before, after } = roundtrip((g) => {
      const S = (id: string, n: string, initial = false) => ({ id, kind: 'step' as const, num: n, name: '', initial, actions: [] });
      const T = (id: string, n: number) => ({ id, kind: 'trans' as const, num: n, recept: 'a' });
      g.seqs = [
        { id: 'a', items: [S('s0', '0', true), T('t1', 1), S('s1', '1')] },
        { id: 'b', items: [T('t2', 2), S('s2', '2'), T('t3', 3)] }, { id: 'c', items: [T('t4', 4), S('s3', '3'), T('t5', 5)] },
        { id: 'd', items: [S('s4', '4'), T('t6', 6)] }, { id: 'e', items: [T('t7', 7), S('s5', '5'), T('t8', 8)] },
        { id: 'f', items: [S('s6', '6')] },
      ];
      g.links = [
        { id: 'l1', kind: 'div', op: 'or', base: 'a', nodes: ['b', 'c'] },
        { id: 'l2', kind: 'div', op: 'or', base: 'd', nodes: ['e', 'c'] },
      ];
      g.links = [{ id: 'l1', kind: 'div', op: 'or', base: 'a', nodes: ['b', 'c'] }, { id: 'l3', kind: 'conv', op: 'or', base: 'f', nodes: ['b', 'c'] }];
      g.jumps = [];
    });
    expect(after).toEqual(before);
  });
});
