import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Item, Project } from '@grafcet/core';
import { exportPlcopenXml, importPlcopenXml, importSfcEditXml, looksLikePlcopenXml } from '../src';
import { demoProject } from '../../grafcet-core/test/helpers';

const fixture = readFileSync(new URL('../../../fixtures/sfcedit/convergence-et-renvoi.xml', import.meta.url), 'utf8');
const NOW = new Date('2026-11-05T14:00:00Z');

const shape = (items: Item[]): unknown[] => items.map((i) =>
  i.kind === 'step' ? `S${i.num}${i.initial ? '*' : ''}:${i.actions.map((a) => a.kind[0] + a.label + (a.cond ? '?' + a.cond : '')).join(',')}`
  : i.kind === 'trans' ? `T:${i.recept}`
  : i.kind === 'jump' ? 'J'
  : { [i.kind]: i.branches.map(shape) });
const shapes = (p: Project) => p.grafcets.map((g) => shape(g.items));

describe('PLCopen XML (TC6 v2.01)', () => {
  const conv = importSfcEditXml(fixture, { projectName: 'conv' }).model;
  const out = exportPlcopenXml(conv, { now: NOW });

  it('écrit un document PLCopen reconnaissable et déterministe', () => {
    expect(looksLikePlcopenXml(out.output)).toBe(true);
    expect(exportPlcopenXml(conv, { now: NOW }).output).toBe(out.output);
    expect(out.output).toContain('<selectionDivergence'.replace('selection', 'simultaneous'));
    expect(out.output).toContain('<jumpStep');
    expect(out.output).toContain('(X4.X OR X11.X) AND NOT At_exit');
  });

  it('aller-retour : même structure, mêmes actions, mêmes réceptivités', () => {
    const back = importPlcopenXml(out.output).model;
    expect(shapes(back)).toEqual(shapes(conv));
    expect(back.name).toBe('conv');
  });

  it('aller-retour sur la démonstration (OU, ET, renvois, actions conditionnelles)', () => {
    const demo = demoProject();
    const o = exportPlcopenXml(demo, { now: NOW });
    const back = importPlcopenXml(o.output).model;
    expect(back.grafcets).toHaveLength(demo.grafcets.length);
    // les actions « ↑ » / « ↓ » et conditionnelles survivent ; les réceptivités à fronts perdent le front (signalé)
    expect(o.report.entries.some((e) => e.message.key === 'rep_p_edge')).toBe(true);
    const count = (p: Project) => p.grafcets.map((g) => JSON.stringify(shape(g.items)).match(/"(or|and)"/g)?.length ?? 0);
    expect(count(back)).toEqual(count(demo));
  });

  it('refuse un document qui n’est pas du PLCopen', () => {
    expect(() => importPlcopenXml('<foo/>')).toThrow();
    expect(() => importPlcopenXml('<project xmlns="http://www.plcopen.org/xml/tc6_0201"><types><pous/></types></project>')).toThrow();
  });

  const xsd = process.env.PLCOPEN_XSD;
  const xmllint = spawnSync('xmllint', ['--version']);
  it.skipIf(!xsd || xmllint.error)('est valide contre le schéma tc6_xml_v201.xsd (PLCOPEN_XSD)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plc-'));
    for (const [name, p] of [['conv', conv], ['demo', demoProject()]] as const) {
      const f = join(dir, name + '.xml');
      writeFileSync(f, exportPlcopenXml(p, { now: NOW }).output);
      const r = spawnSync('xmllint', ['--noout', '--schema', xsd!, f], { encoding: 'utf8' });
      expect(r.stderr).toContain('validates');
    }
  });
});

describe('synchronisation', () => {
  it('relie la transition à toutes les étapes attendues', async () => {
    const { exportPlcopenXml } = await import('../src');
    const P = (await import('../../grafcet-core/test/helpers')).demoProject();
    const g = P.grafcets[0]!;
    const steps = g.items.filter((i) => i.kind === 'step') as { id: string }[];
    const t = g.items.find((i) => i.kind === 'trans' && i.id !== undefined)! as { sync?: string[] };
    t.sync = [steps[steps.length - 1]!.id];
    const xml = exportPlcopenXml(P).output as string;
    const m = /<transition localId="\d+">.*?<connectionPointIn>(.*?)<\/connectionPointIn>/.exec(xml);
    expect((m![1]!.match(/<connection /g) ?? []).length).toBe(2);
  });
});
