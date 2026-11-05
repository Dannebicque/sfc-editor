import { describe, expect, it } from 'vitest';
import { flatten } from '@grafcet/core';
import { enabledTransitions, fire, initialMarking } from '../src';
import { demoProject } from '../../grafcet-core/test/helpers';

describe('simulation à jetons', () => {
  it('parcourt le cycle du vérin et revient à l’étape initiale', () => {
    const g = demoProject().grafcets[1]!;
    const flat = flatten(g);
    let m: Set<string> = initialMarking(g);
    expect(m.size).toBe(1);
    const start = [...m][0];
    for (let i = 0; i < 3; i++) {
      const en = enabledTransitions(flat, m);
      expect(en.size).toBe(1);
      m = fire(flat, m, [...en][0]!);
    }
    expect([...m]).toEqual([start]);
  });
  it('la divergence ET active les branches en parallèle', () => {
    const g = demoProject().grafcets[0]!;
    const flat = flatten(g);
    let m: Set<string> = initialMarking(g);
    for (let i = 0; i < 20 && m.size < 2; i++) {
      const en = [...enabledTransitions(flat, m)];
      if (!en.length) break;
      m = fire(flat, m, en[0]!);
    }
    expect(m.size).toBeGreaterThanOrEqual(2);
  });
});
