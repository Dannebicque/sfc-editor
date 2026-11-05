import { describe, expect, it } from 'vitest';
import { demoProject } from '../../grafcet-core/test/helpers';
import { exportArchive, exportFolder, exportNative, importArchive, importFolder, ImportError, looksLikeZip } from '../src';
import { readZip, writeZip } from '../src/zip';

describe('format dossier et archive ZIP', () => {
  const project = demoProject();
  it('produit un fichier par GRAFCET, trié', () => {
    const paths = exportFolder(project).output.map((f) => f.path);
    expect(paths).toEqual([...paths].sort());
    expect(paths).toContain('project.json');
    expect(paths.filter((p) => p.startsWith('grafcets/'))).toHaveLength(project.grafcets.length);
  });
  it('aller-retour dossier identique au format natif', () => {
    const back = importFolder(exportFolder(project).output).model;
    expect(exportNative(back).output).toBe(exportNative(project).output);
  });
  it('archive déterministe et relisible', () => {
    const a = exportArchive(project).output, b = exportArchive(project).output;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(looksLikeZip(a)).toBe(true);
    expect(exportNative(importArchive(a).model).output).toBe(exportNative(project).output);
  });
  it('détecte une archive corrompue ou incomplète', () => {
    const a = exportArchive(project).output.slice();
    const nameLen = new DataView(a.buffer).getUint16(26, true);
    a[30 + nameLen + 5] = a[30 + nameLen + 5]! ^ 0xff; // octet de données altéré (premier fichier)
    expect(() => importArchive(a)).toThrow(ImportError);
    expect(() => importArchive(new Uint8Array([1, 2, 3, 4]))).toThrow(ImportError);
    expect(() => importFolder([])).toThrow(ImportError);
  });
  it('refuse les chemins sortant de l’archive', () => {
    const z = writeZip([{ path: '../x.json', data: new Uint8Array([1]) }]);
    expect(() => readZip(z)).toThrow();
  });
});

describe('actions liées à une transition', () => {
  it('survivent à l’aller-retour natif', async () => {
    const { exportNative, importNative } = await import('../src');
    const P = (await import('../../grafcet-core/test/helpers')).demoProject();
    const t = P.grafcets[0]!.items.find((i) => i.kind === 'trans')! as { actions?: unknown[] };
    t.actions = [{ kind: 'event', label: 'B:=0', cond: 'X3' }];
    const back = importNative(exportNative(P).output);
    const t2 = back.model.grafcets[0]!.items.find((i) => i.kind === 'trans')! as { actions?: unknown[] };
    expect(t2.actions).toEqual([{ kind: 'event', label: 'B:=0', cond: 'X3' }]);
  });
});
