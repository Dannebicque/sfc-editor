import { describe, expect, it } from 'vitest';
import type { Grafcet, Project } from '@grafcet/core';
import { buildSimulation, enabledTransitions, fire, frozenGrafcets, settle } from '../src';

const step = (id: string, num: string, initial = false, label = '') => ({ id, kind: 'step' as const, num, name: '', initial, actions: label ? [{ kind: 'continue' as const, label, cond: '' }] : [] });
const trans = (id: string, num: number) => ({ id, kind: 'trans' as const, num, recept: '1' });
const loop = (id: string, name: string, items: Grafcet['seqs'][number]['items']): Grafcet => ({ id, name, nextStep: 9, nextTrans: 9, seqs: [{ id: 'q' + id, items }], links: [], jumps: [{ id: 'j' + id, from: 'q' + id, to: items[0]!.id }] });

/** Conduite : 0 → 1 (1 porte l'ordre). Partiel GP : a → b → c, a initial. */
const mk = (order: string): Project => ({
  name: 'p', counter: 100, gcount: 3,
  grafcets: [
    loop('g1', 'GC', [step('c0', '0', true), trans('ct0', 1), step('c1', '1', false, order), trans('ct1', 2)]),
    loop('g2', 'GP', [step('a', 'A', true), trans('ta', 1), step('b', 'B'), trans('tb', 2), step('c', 'C'), trans('tc', 3)]),
  ],
});

describe('GRAFCETs partiels : ordres de forçage portés par une étape', () => {
  it('le GRAFCET visé entre dans la simulation sans être la racine', () => {
    const sim = buildSimulation(mk('GP{B}'), 'g1');
    expect(sim.grafcets.has('g2')).toBe(true);
    expect(sim.initial.has('a')).toBe(true);
  });
  it('GP{B} : dès que l\'étape 1 est active, GP est dans la situation B', () => {
    const P = mk('GP{B}');
    const sim = buildSimulation(P, 'g1');
    let s = { marking: new Set(sim.initial), frozen: new Set<string>() };
    s = settle(sim, s);
    expect(s.marking.has('a')).toBe(true);
    s = settle(sim, { ...s, marking: fire(sim.flat, s.marking, 'ct0') });
    expect([...s.marking].sort()).toEqual(['b', 'c1']);
  });
  it('GP{*} fige GP tant que l\'étape porteuse est active', () => {
    const sim = buildSimulation(mk('GP{*}'), 'g1');
    let s = settle(sim, { marking: new Set(sim.initial), frozen: new Set<string>() });
    const free = (st: typeof s) => enabledTransitions(sim.flat, st.marking, { owner: sim.owner, grafcets: frozenGrafcets(sim, st) });
    expect(free(s).has('ta')).toBe(true);
    s = settle(sim, { ...s, marking: fire(sim.flat, s.marking, 'ct0') });
    expect(frozenGrafcets(sim, s).has('g2')).toBe(true);
    expect(free(s).has('ta')).toBe(false);
    s = settle(sim, { ...s, marking: fire(sim.flat, s.marking, 'ct1') });
    expect(free(s).has('ta')).toBe(true);
  });
  it('GP{} vide GP ; GP{INIT} le remet à l\'initial', () => {
    for (const [order, expected] of [['GP{}', ['c1']], ['GP{INIT}', ['a', 'c1']]] as const) {
      const sim = buildSimulation(mk(order), 'g1');
      let s = settle(sim, { marking: new Set(sim.initial), frozen: new Set<string>() });
      s = settle(sim, { ...s, marking: fire(sim.flat, s.marking, 'ct0') });
      expect([...s.marking].sort()).toEqual([...expected]);
    }
  });
  it('un GRAFCET visé introuvable est signalé et sans effet', () => {
    const sim = buildSimulation(mk('GX{INIT}'), 'g1');
    expect(sim.unresolved).toEqual([{ step: 'c1', text: 'GX{INIT}' }]);
    expect(sim.orders.size).toBe(0);
  });
  it('un ordre qui se vise lui-même termine', () => {
    const sim = buildSimulation(mk('GC{}'), 'g1');
    let s = settle(sim, { marking: new Set(sim.initial), frozen: new Set<string>() });
    s = settle(sim, { ...s, marking: fire(sim.flat, s.marking, 'ct0') });
    expect([...s.marking].some((x) => x.startsWith('c'))).toBe(false);
  });
});
