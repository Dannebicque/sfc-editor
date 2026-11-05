import { describe, expect, it } from 'vitest';
import { exportNative, importJson, importNative, ImportError } from '../src';
import { demoProject } from '../../grafcet-core/test/helpers';

const defaults = { grafcetName: 'G', projectName: 'P' };

describe('format natif', () => {
  it('aller-retour sans perte et sérialisation déterministe', () => {
    const P = demoProject();
    const a = exportNative(P).output;
    const back = importNative(a).model;
    expect(back).toEqual(P);
    expect(exportNative(back).output).toBe(a);
    expect(a.endsWith('\n')).toBe(true);
  });
  it('refuse un format inconnu, une version majeure incompatible et un JSON invalide', () => {
    const P = demoProject();
    const doc = JSON.parse(exportNative(P).output);
    expect(() => importNative('{')).toThrow(ImportError);
    expect(() => importNative(JSON.stringify({ ...doc, format: 'autre' }))).toThrow(/imp_format/);
    expect(() => importNative(JSON.stringify({ ...doc, schemaVersion: '2.0.0' }))).toThrow(/imp_version/);
  });
  it('refuse une structure contraire à la grammaire', () => {
    const doc = JSON.parse(exportNative(demoProject()).output);
    doc.project.grafcets[1].items.splice(1, 1); // retire une transition : deux étapes consécutives
    expect(() => importNative(JSON.stringify(doc))).toThrow(/imp_struct/);
  });
});

describe('import JSON libre', () => {
  it('remplace le projet quand le document contient des grafcets', () => {
    const P = demoProject();
    const r = importJson(JSON.stringify(P), demoProject(), defaults).model;
    expect(r.project.grafcets.length).toBe(3);
    expect(r.activeId).toBe(P.grafcets[0]!.id);
  });
  it('ajoute un GRAFCET isolé au projet courant avec un nouvel id', () => {
    const cur = demoProject();
    const r = importJson(JSON.stringify(cur.grafcets[1]), cur, defaults).model;
    expect(r.project.grafcets.length).toBe(4);
    expect(r.project.grafcets[3]!.id).not.toBe(cur.grafcets[1]!.id);
    expect(cur.grafcets.length).toBe(3); // le projet courant n’est pas modifié
  });
  it('rejette ids dupliqués et structures invalides', () => {
    const cur = demoProject();
    const bad = JSON.parse(JSON.stringify(cur.grafcets[1]));
    bad.items[2].id = bad.items[0].id;
    expect(() => importJson(JSON.stringify(bad), cur, defaults)).toThrow(/imp_ids/);
    expect(() => importJson('{"items":[]}', cur, defaults)).toThrow(/imp_struct/);
  });
});
