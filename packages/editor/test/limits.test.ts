import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nodesOf } from '@grafcet/core';
import { applyLang } from '../src/i18n';
import { exceeded, GUEST_LIMITS, isExportLocked, overLimit } from '../src/limits';
import { useProjectStore } from '../src/stores/project';
import { useUiStore } from '../src/stores/ui';

beforeEach(() => { localStorage.clear(); applyLang('fr'); setActivePinia(createPinia()); });

const steps = (p: ReturnType<typeof useProjectStore>) => nodesOf(p.activeG).filter((n) => n.kind === 'step').length;

describe('limites de l\'essai sans compte', () => {
  it('sans limites (instance locale), rien n\'est bloqué', () => {
    const p = useProjectStore();
    expect(p.limits).toBeNull();
    for (let i = 0; i < 5; i++) p.addGrafcet();
    expect(p.project.grafcets.length).toBeGreaterThan(GUEST_LIMITS.grafcets);
  });
  it('plafonne le nombre de GRAFCET sans rien supprimer', () => {
    const p = useProjectStore(); const ui = useUiStore();
    p.limits = { ...GUEST_LIMITS, grafcets: p.project.grafcets.length };
    const n = p.project.grafcets.length;
    p.addGrafcet();
    expect(p.project.grafcets.length).toBe(n);
    expect(ui.limitHit).toBe('grafcets');
    expect(p.past.length).toBe(0);
  });
  it('ne change pas de GRAFCET quand la limite refuse l\'ajout', () => {
    const p = useProjectStore(); const ui = useUiStore();
    p.limits = { ...GUEST_LIMITS, grafcets: p.project.grafcets.length };
    p.activeId = p.project.grafcets[1]!.id;
    ui.addGrafcet();
    expect(p.activeId).toBe(p.project.grafcets[1]!.id);
  });
  it('plafonne les étapes d\'un GRAFCET : un projet déjà au-delà reste éditable (retrait seulement)', () => {
    const p = useProjectStore(); const ui = useUiStore();
    p.limits = { grafcets: 99, steps: steps(p) };
    ui.sel = nodesOf(p.activeG).find((i) => i.kind === 'trans')!.id;
    const n = steps(p);
    ui.insertKind('step');
    expect(steps(p)).toBe(n);
    expect(ui.limitHit).toBe('steps');
  });
  it('exceeded : n\'interdit que l\'ajout', () => {
    const p = useProjectStore();
    const small = JSON.parse(JSON.stringify(p.project));
    const big = JSON.parse(JSON.stringify(p.project));
    big.grafcets.push(JSON.parse(JSON.stringify(big.grafcets[0])));
    const lim = { grafcets: small.grafcets.length, steps: 999 };
    expect(exceeded(small, big, lim)).toBe('grafcets');
    expect(exceeded(big, small, lim)).toBeNull();
    expect(exceeded(small, big, null)).toBeNull();
  });
  it('refuse l\'import d\'un projet trop gros, sauf sans limites', () => {
    const p = useProjectStore();
    expect(overLimit(p.project, { grafcets: 1, steps: 999 })).toBe('grafcets');
    expect(overLimit(p.project, null)).toBeNull();
    p.limits = { grafcets: 1, steps: 999 };
    expect(() => p.replaceProject(p.project, { enforce: true })).toThrow();
  });
  it('verrouille les formats d\'interopérabilité seulement avec des limites', () => {
    expect(isExportLocked('plcopen', GUEST_LIMITS)).toBe(true);
    expect(isExportLocked('png', GUEST_LIMITS)).toBe(false);
    expect(isExportLocked('plcopen', null)).toBe(false);
  });
});
