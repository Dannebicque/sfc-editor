import { describe, expect, it } from 'vitest';
import { nodesOf } from '@grafcet/core';
import { applyForcing, buildSimulation, enabledTransitions, fire } from '../src';
import { demoProject } from '../../grafcet-core/test/helpers';

const setup = () => {
  const P = demoProject();
  const g = P.grafcets[1]!;
  const sim = buildSimulation(P, g.id);
  const steps = nodesOf(g).filter((n) => n.kind === 'step');
  return { P, g, sim, steps, state: { marking: new Set(sim.initial), frozen: new Set<string>() } };
};

describe('forçages IEC 60848', () => {
  it('{} vide le GRAFCET visé', () => {
    const { g, sim, state } = setup();
    expect(applyForcing(sim, state, g.id, { kind: 'empty' }).marking.size).toBe(0);
  });
  it('{INIT} rétablit la situation initiale', () => {
    const { g, sim, state } = setup();
    const en = [...enabledTransitions(sim.flat, state.marking)];
    const moved = { ...state, marking: fire(sim.flat, state.marking, en[0]!) };
    expect([...moved.marking]).not.toEqual([...sim.initial]);
    expect([...applyForcing(sim, moved, g.id, { kind: 'init' }).marking]).toEqual([...sim.initial]);
  });
  it('{X…} impose une situation, sans retenir les étapes étrangères au GRAFCET', () => {
    const { g, sim, steps, state } = setup();
    const a = steps[1]!.id;
    expect([...applyForcing(sim, state, g.id, { kind: 'steps', steps: [a, 'inconnue'] }).marking]).toEqual([a]);
  });
  it('{*} fige : plus aucune transition franchissable, jusqu\'à la levée', () => {
    const { g, sim, state } = setup();
    expect(enabledTransitions(sim.flat, state.marking).size).toBeGreaterThan(0);
    const frozen = applyForcing(sim, state, g.id, { kind: 'freeze' });
    expect([...frozen.marking]).toEqual([...state.marking]);
    expect(enabledTransitions(sim.flat, frozen.marking, { owner: sim.owner, grafcets: frozen.frozen }).size).toBe(0);
    const free = applyForcing(sim, frozen, g.id, { kind: 'release' });
    expect(enabledTransitions(sim.flat, free.marking, { owner: sim.owner, grafcets: free.frozen }).size).toBeGreaterThan(0);
  });
  it('un forçage ne touche pas les autres GRAFCET', () => {
    const P = demoProject();
    const [a, b] = [P.grafcets[0]!, P.grafcets[1]!];
    const sim = buildSimulation({ ...P, grafcets: P.grafcets }, a.id);
    const state = { marking: new Set(sim.initial), frozen: new Set<string>() };
    const out = applyForcing(sim, state, a.id, { kind: 'empty' });
    expect([...out.marking].every((id) => sim.owner.get(id) !== a.id)).toBe(true);
    expect(b.id).not.toBe(a.id);
  });
});
