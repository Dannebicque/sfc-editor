import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nodesOf, taskLinks, validateGrafcet, violations } from '@grafcet/core';
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
    for (const n of ['2_1', '6_5']) {
      const from = gast.jumps.filter((j) => j.to === step(n).id).map((j) => gast.seqs.find((q) => q.id === j.from)!);
      expect(from.some((q) => q.items.length === 0)).toBe(true);
    }
  });
  it('GAST est entièrement valide, sans erreur d\'import', () => {
    expect(violations(gast)).toEqual([]);
    expect(report.entries.filter((e) => e.level === 'error')).toEqual([]);
  });
  it('les réceptivités à crochets [dcc1=1] sont comprises (GT1, GT5)', () => {
    for (const n of ['GT1', 'GT5']) {
      const g = model.grafcets.find((x) => x.name === n)!;
      expect(validateGrafcet(g).filter((i) => i.level === 'error')).toEqual([]);
    }
  });
  it('les noms X2_1, X1_2… sont affichés 2_1, 1_2… (comme SFCEdit) et réexportés avec leur X', () => {
    const nums = nodesOf(gast).filter((n) => n.kind === 'step').map((n) => String(n.num));
    expect(nums).toEqual(expect.arrayContaining(['2_1', '1_2', '5_6', '6_5', '30']));
    expect(nums.some((n) => /^X\d/.test(n))).toBe(false);
    expect(exportSfcEditXml(model).output).toContain('name="X2_1"');
    expect(validateGrafcet(gast).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('fronts <re/> <fe/> et types « on event » / « on deact » sont compris', () => {
    const gmma = model.grafcets.find((g) => g.name === 'GMMA')!;
    const acts = nodesOf(gmma).flatMap((n) => (n.kind === 'step' ? n.actions : []));
    expect(acts.filter((a) => a.kind === 'deactivation').map((a) => a.label).sort()).toEqual(['Count1:=999', 'Count2:=999']);
    expect(acts.filter((a) => a.kind === 'event').map((a) => a.cond)).toEqual(expect.arrayContaining(['↓fpc1', '↓fpc2']));
    expect(nodesOf(gmma).some((n) => n.kind === 'trans' && n.recept === '↑bp_start')).toBe(true);
    expect(report.entries.filter((e) => ['rep_unknown_tag', 'rep_action_type'].includes(e.message.key))).toEqual([]);
  });
  it('GMMA : les actions liées à la transition bp_start sont importées et réexportées', () => {
    const gmma = model.grafcets.find((g) => g.name === 'GMMA')!;
    const t = nodesOf(gmma).find((n) => n.kind === 'trans' && n.recept === '↑bp_start');
    expect(t && t.kind === 'trans' ? t.actions?.map((a) => a.label) : []).toEqual(['Count1:=0', 'Count2:=0', 'blue1:=blue01', 'blue2:=blue02']);
    const back = importSfcEditXml(exportSfcEditXml(model).output, { projectName: 'sep' }).model.grafcets.find((g) => g.name === 'GMMA')!;
    const t2 = nodesOf(back).find((n) => n.kind === 'trans' && n.recept === '↑bp_start');
    expect(t2 && t2.kind === 'trans' ? t2.actions?.length : 0).toBe(4);
  });
  it('les 16 étapes « task » de GAST sont conservées (drapeau task), sans avertissement', () => {
    expect(report.entries.some((e) => e.message.key === 'rep_step_type')).toBe(false);
    const tasks = nodesOf(gast).filter((n) => n.kind === 'step' && n.task);
    expect(tasks).toHaveLength(16);
    const back = importSfcEditXml(exportSfcEditXml(model).output, { projectName: 'sep' }).model.grafcets.find((g) => g.name === 'GAST')!;
    expect(nodesOf(back).filter((n) => n.kind === 'step' && n.task)).toHaveLength(16);
  });
  it('chaque étape-tâche est liée au GRAFCET qui démarre dessus (GT4 ← XT4A, XT4B, XT4C)', () => {
    const links = taskLinks(model);
    const name = (id: string) => model.grafcets.find((g) => g.id === id)!.name;
    const byRunner = (r: string) => links.filter((l) => name(l.runner) === r).map((l) => l.num).sort();
    expect(byRunner('GT4')).toEqual(['XT4A', 'XT4B', 'XT4C']);
    expect(byRunner('GT2')).toEqual(['XT2A', 'XT2B']);
    expect(byRunner('GT3I')).toEqual(['XT3I']);
    expect(new Set(links.map((l) => l.stepId)).size).toBe(16);
    expect(validateGrafcet(gast, { project: model }).filter((i) => i.key === 'v_task_orphan')).toEqual([]);
  });
  it('une étape-tâche que personne ne démarre est signalée', () => {
    const m = structuredClone(model);
    const gt4 = m.grafcets.find((g) => g.name === 'GT4')!;
    const t = nodesOf(gt4).find((n) => n.kind === 'trans')!;
    if (t.kind === 'trans') t.recept = 'x';
    const g = m.grafcets.find((x) => x.name === 'GAST')!;
    expect(validateGrafcet(g, { project: m }).filter((i) => i.key === 'v_task_orphan').map((i) => i.params!.n).sort()).toEqual(['XT4A', 'XT4B', 'XT4C']);
  });
  it('aller-retour SFCEdit : fronts et types d\'action conservés', () => {
    const out = exportSfcEditXml(model).output;
    expect(out).toContain('<re />');
    expect(out).toContain('<fe />');
    expect(out).toContain('type="on deact"');
    expect(out).toContain('type="on event"');
    const again = importSfcEditXml(out, { projectName: 'sep' });
    const a = (m: typeof model) => JSON.stringify(m.grafcets.find((g) => g.name === 'GMMA'));
    expect(a(again.model)).toEqual(a(model));
  });
  it('aller-retour SFCEdit : GAST reste valide', () => {
    const out = exportSfcEditXml(model).output;
    const again = importSfcEditXml(out, { projectName: 'sep' }).model.grafcets.find((g) => g.name === 'GAST')!;
    expect(violations(again)).toEqual([]);
    expect(again.jumps).toHaveLength(gast.jumps.length);
  });
});
