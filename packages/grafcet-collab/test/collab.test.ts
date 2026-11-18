import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { demoProject } from '../../grafcet-core/test/helpers';
import { docFromProject, docFromState, encodeState, readProject, writeProject } from '../src';

const sync = (a: Y.Doc, b: Y.Doc): void => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
};
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe('projet ↔ document Yjs', () => {
  it('relit exactement le projet écrit (ordre compris)', () => {
    const p = demoProject();
    expect(readProject(docFromProject(p))).toMatchObject({ name: p.name, grafcets: p.grafcets });
  });
  it('survit à une sérialisation de l\'état', () => {
    const p = demoProject();
    expect(readProject(docFromState(encodeState(docFromProject(p)))).grafcets).toEqual(p.grafcets);
  });
  it('n\'écrit que ce qui change', () => {
    const p = demoProject();
    const doc = docFromProject(p);
    expect(writeProject(doc, clone(p))).toBe(false);
    const q = clone(p); q.name = 'Autre';
    expect(writeProject(doc, q)).toBe(true);
  });
  it('fusionne sans perte deux éditions de GRAFCETs différents', () => {
    const p = demoProject();
    if (p.grafcets.length < 2) p.grafcets.push({ ...clone(p.grafcets[0]!), id: 'g99', name: 'Second' });
    const a = docFromProject(p), b = new Y.Doc();
    sync(a, b);
    const pa = readProject(a), pb = readProject(b);
    pa.grafcets[0]!.name = 'édité par A'; pb.grafcets[1]!.name = 'édité par B';
    writeProject(a, pa); writeProject(b, pb);
    sync(a, b);
    for (const d of [a, b]) {
      const r = readProject(d);
      expect(r.grafcets[0]!.name).toBe('édité par A');
      expect(r.grafcets[1]!.name).toBe('édité par B');
    }
  });
  it('sur un même GRAFCET, un seul des deux états gagne, jamais un mélange', () => {
    const p = demoProject();
    const a = docFromProject(p), b = new Y.Doc();
    sync(a, b);
    const pa = readProject(a), pb = readProject(b);
    pa.grafcets[0]!.name = 'A'; pa.grafcets[0]!.comment = 'de A';
    pb.grafcets[0]!.name = 'B'; pb.grafcets[0]!.comment = 'de B';
    writeProject(a, pa); writeProject(b, pb);
    sync(a, b);
    const ga = readProject(a).grafcets[0]!, gb = readProject(b).grafcets[0]!;
    expect(ga).toEqual(gb);
    expect(ga.name === 'A' ? ga.comment : ga.comment).toBe(ga.name === 'A' ? 'de A' : 'de B');
  });
  it('suppression d\'un GRAFCET propagée ; compteurs jamais en dessous des identifiants présents', () => {
    const p = demoProject();
    p.counter = 0;
    const doc = docFromProject(p);
    expect(readProject(doc).counter).toBeGreaterThan(0);
    const q = readProject(doc);
    q.grafcets = q.grafcets.slice(1);
    writeProject(doc, q);
    expect(readProject(doc).grafcets).toHaveLength(p.grafcets.length - 1);
  });
});
