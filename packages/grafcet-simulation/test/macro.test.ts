
import { describe, expect, it } from 'vitest';
import { createExpansion, setMacro, type Grafcet, type Project } from '@grafcet/core';
import { buildSimulation, enabledTransitions, fire, macroActive } from '../src';

const mkP = (): { P: Project; g: Grafcet; macroId: string; t2: string; t1: string } => {
  const g: Grafcet = {
    id: 'g1', name: 'Principal', nextStep: 3, nextTrans: 3,
    items: [
      { id: 's0', kind: 'step', num: '0', name: '', initial: true, actions: [] },
      { id: 't1', kind: 'trans', num: 1, recept: 'a' },
      { id: 'm', kind: 'step', num: 'M1', name: '', initial: false, actions: [] },
      { id: 't2', kind: 'trans', num: 2, recept: 'b' },
      { id: 's3', kind: 'step', num: '3', name: '', initial: false, actions: [] },
      { id: 'j', kind: 'jump', target: 's0' },
    ],
  };
  const P: Project = { name: 'p', counter: 100, gcount: 2, grafcets: [g] };
  setMacro(g, 'm', true);
  createExpansion(P, g, 'm', 'Expansion M1');
  return { P, g, macroId: 'm', t1: 't1', t2: 't2' };
};

describe('simulation avec macro-étape', () => {
  it('le franchissement entre dans l’expansion, la sortie libère la transition aval', () => {
    const { P, macroId, t1, t2 } = mkP();
    const sim = buildSimulation(P, 'g1');
    expect(sim.members.get(macroId)).toHaveLength(2);
    let m: Set<string> = new Set(sim.initial);
    expect([...enabledTransitions(sim.flat, m)]).toEqual([t1]);
    m = fire(sim.flat, m, t1);
    expect(macroActive(sim, m, macroId)).toBe(true);
    // la transition interne (E → S) est franchissable ; t2 attend l'étape de sortie
    const internal = [...enabledTransitions(sim.flat, m)];
    expect(internal).toHaveLength(1);
    expect(internal[0]).not.toBe(t2);
    m = fire(sim.flat, m, internal[0]!);
    expect(enabledTransitions(sim.flat, m).has(t2)).toBe(true);
    m = fire(sim.flat, m, t2);
    expect(macroActive(sim, m, macroId)).toBe(false);
  });
});

describe('transition source', () => {
  it('est validable sans étape amont', () => {
    const flat = { nodes: [{ id: 't', kind: 'trans' as const, num: 1 }, { id: 's', kind: 'step' as const, num: '1' }], links: [{ from: 't', to: 's' }] };
    expect([...enabledTransitions(flat, new Set())]).toEqual(['t']);
    expect([...fire(flat, new Set(), 't')]).toEqual(['s']);
  });
});
