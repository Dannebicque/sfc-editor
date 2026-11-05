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
    expect(() => importNative(JSON.stringify({ ...doc, schemaVersion: '3.0.0' }))).toThrow(/imp_version/);
  });
  it('refuse une structure contraire à la grammaire', () => {
    const doc = JSON.parse(exportNative(demoProject()).output);
    doc.project.grafcets[1].seqs[0].items.splice(1, 1); // retire une transition : deux étapes consécutives
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
    bad.seqs[0].items[2].id = bad.seqs[0].items[0].id;
    expect(() => importJson(JSON.stringify(bad), cur, defaults)).toThrow(/imp_ids/);
    expect(() => importJson('{"items":[]}', cur, defaults)).not.toThrow();
    expect(() => importJson('{}', cur, defaults)).toThrow(/imp_items/);
  });
});

describe('lecture de l’ancien format 1.x (arbre de blocs)', () => {
  const tree = {
    format: 'grafcet-studio-project', schemaVersion: '1.1.0',
    project: { name: 'ancien', counter: 20, gcount: 2, grafcets: [{ id: 'g1', name: 'A', nextStep: 3, nextTrans: 3, items: [
      { id: 'n1', kind: 'step', num: '0', name: '', initial: true, actions: [] }, { id: 'n2', kind: 'trans', num: 1, recept: 'a' }, { id: 'n9', kind: 'step', num: '9', name: '', initial: false, actions: [] },
      { id: 'o', kind: 'or', branches: [[{ id: 'n3', kind: 'trans', num: 2, recept: 'b' }, { id: 'n4', kind: 'step', num: '1', name: '', initial: false, actions: [] }, { id: 'n41', kind: 'trans', num: 5, recept: 'e' }], [{ id: 'n5', kind: 'trans', num: 3, recept: 'c' }, { id: 'n6', kind: 'step', num: '2', name: '', initial: false, actions: [] }, { id: 'n61', kind: 'trans', num: 6, recept: 'f' }]] },
      { id: 'n8', kind: 'step', num: '3', name: '', initial: false, actions: [] }, { id: 'n7', kind: 'trans', num: 4, recept: 'd' }, { id: 'j', kind: 'jump', target: 'n1' },
    ] }] },
  };
  it('est converti en séquences et liens', () => {
    const P = importNative(JSON.stringify(tree)).model;
    const g = P.grafcets[0]!;
    expect(g.links.map((l) => `${l.kind}-${l.op}`)).toEqual(['div-or']);
    expect(g.jumps).toHaveLength(1);
    expect(g.seqs.length).toBe(4);
  });
  it('importJson accepte un GRAFCET en arbre', () => {
    const r = importJson(JSON.stringify(tree.project.grafcets[0]), demoProject(), defaults).model;
    expect(r.project.grafcets).toHaveLength(4);
  });
});
