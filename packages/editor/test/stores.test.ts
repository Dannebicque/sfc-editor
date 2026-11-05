import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { checkGraph, nodesOf, seqContaining } from '@grafcet/core';
import { applyLang } from '../src/i18n';
import { useProjectStore } from '../src/stores/project';
import { useUiStore } from '../src/stores/ui';

beforeEach(() => {
  localStorage.clear();
  applyLang('fr');
  setActivePinia(createPinia());
});

const N = (g: import('@grafcet/core').Grafcet) => nodesOf(g);

describe('commandes utilisateur', () => {
  it('insère, annule et rétablit en gardant la structure valide', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    project.activeId = project.project.grafcets[1]!.id;
    const g = () => project.activeG;
    ui.sel = N(g()).find((i) => i.kind === 'trans')!.id;
    const n = N(g()).length;
    ui.insertKind('step');
    expect(N(g()).length).toBe(n + 2);
    expect(checkGraph(g())).toBeNull();
    project.undo();
    expect(N(g()).length).toBe(n);
    project.redo();
    expect(N(g()).length).toBe(n + 2);
  });
  it('insérer une étape après une étape intercale une transition ; sans sélection, rien ne change', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    ui.sel = null;
    const before = JSON.stringify(project.project);
    ui.insertKind('step');
    expect(JSON.stringify(project.project)).toBe(before);
    expect(project.past.length).toBe(0);
    ui.sel = N(project.activeG).find((i) => i.kind === 'step')!.id;
    const n = N(project.activeG).length;
    ui.insertKind('step');
    expect(N(project.activeG).length).toBe(n + 2);
    expect(checkGraph(project.activeG)).toBeNull();
  });
  it('regroupe les frappes consécutives d’un même champ en une seule entrée d’historique', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    ui.sel = N(project.activeG).find((i) => i.kind === 'trans')!.id;
    ui.setField('recept', 'a', true);
    ui.setField('recept', 'a .', true);
    ui.setField('recept', 'a . b', true);
    expect(project.past.length).toBe(1);
    project.undo();
    expect(JSON.stringify(project.project)).not.toContain('a . b');
  });
  it('supprime un élément et sélectionne le voisin', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    project.activeId = project.project.grafcets[1]!.id;
    ui.sel = N(project.activeG)[2]!.id;
    const n = N(project.activeG).length;
    ui.removeSel();
    expect(N(project.activeG).length).toBeLessThan(n);
    expect(checkGraph(project.activeG)).toBeNull();
  });
  it('importe un projet natif exporté (aller-retour)', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    ui.dataView = 'native';
    ui.importText = ui.dataText;
    ui.applyImport();
    expect(ui.importMsg.cls).toBe('ok');
    expect(project.project.grafcets.length).toBe(3);
  });
  it('retraduit la démonstration intacte quand la langue change, mais pas un projet modifié', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    ui.setLang('en');
    expect(project.project.name).toBe('Demo project');
    ui.sel = N(project.activeG).find((i) => i.kind === 'trans')!.id;
    ui.setField('recept', 'zzz');
    ui.setLang('fr');
    expect(project.project.name).toBe('Demo project');
  });
});

describe('édition (store)', () => {
  it('Maj + lettre insère de l’autre côté', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    project.activeId = project.project.grafcets[1]!.id;
    const g = () => project.activeG;
    const s1 = N(g()).filter((i) => i.kind === 'step')[1]!;
    ui.sel = s1.id;
    const pos = () => { const c = seqContaining(g(), s1.id)!; return c.items.findIndex((i) => i.id === s1.id); };
    const idx = pos();
    ui.insertKind('step', true); // avant
    expect(pos()).toBe(idx + 2);
    expect(checkGraph(g())).toBeNull();
  });
  it('ajoute une divergence OU puis une convergence OU, annulables, structure toujours valide', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    project.activeId = project.project.grafcets[1]!.id;
    ui.sel = N(project.activeG).filter((i) => i.kind === 'step')[1]!.id;
    const links = project.activeG.links.length;
    ui.addLinkAt('div', 'or');
    expect(project.activeG.links.length).toBe(links + 1);
    expect(checkGraph(project.activeG)).toBeNull();
    project.undo();
    expect(project.activeG.links.length).toBe(links);
  });
  it('connecte deux éléments (renvoi) via le mode en attente', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    project.activeId = project.project.grafcets[2]!.id;
    expect(checkGraph(project.activeG)).toBeNull();
    ui.cancelPending();
    expect(ui.pending).toBeNull();
  });
});

describe('import SFCEdit', () => {
  it('importe le XML, affiche le rapport et ne signale pas les Xn des autres GRAFCET', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const xml = readFileSync(resolve(process.cwd(), '../../fixtures/sfcedit/convergence-et-renvoi.xml'), 'utf8');
    const ui = useUiStore();
    const project = useProjectStore();
    ui.importText = xml;
    ui.applyImport('exemple.xml');
    expect(ui.importMsg.cls).toBe('ok');
    expect(project.project.name).toBe('exemple');
    expect(project.project.grafcets).toHaveLength(2);
    project.activeId = project.project.grafcets[1]!.id;
    expect(project.issues.filter((i) => i.key === 'v_step_missing')).toEqual([]);
  });
});

describe('étape présente dans plusieurs GRAFCET', () => {
  it('retrouve l’étape de même identifiant dans les autres GRAFCET et la sélectionne à l’ouverture', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const xml = readFileSync(resolve(process.cwd(), '../../fixtures/sfcedit/convergence-et-renvoi.xml'), 'utf8');
    const ui = useUiStore();
    const project = useProjectStore();
    ui.importText = xml;
    ui.applyImport('x.xml');
    const [g1, g2] = project.project.grafcets;
    // « 15 » n'existe que dans Grafcet1 : aucune liaison depuis Grafcet
    ui.sel = N(g1!)[0]!.id;
    await Promise.resolve();
    expect(ui.linkedIn).toEqual([]);
    // une étape de même identifiant dans les deux GRAFCET
    project.mutate((g) => { const s = nodesOf(g).find((i) => i.kind === 'step'); if (s && s.kind === 'step') s.num = '15'; });
    ui.sel = null; ui.sel = N(g1!)[0]!.id;
    await new Promise((r) => setTimeout(r, 0));
    expect(ui.linkedNum).toBe('15');
    expect(ui.linkedIn.map((l) => l.gid)).toEqual([g2!.id]);
    expect(ui.sharedNum).toBe('15');
    ui.openG(g2!.id);
    await new Promise((r) => setTimeout(r, 20));
    expect(N(g2!).find((i) => i.id === ui.sel)).toMatchObject({ kind: 'step', num: '15' });
    expect(project.activeId).toBe(g2!.id);
  });
});

describe('profil de vérification', () => {
  it('change les contrôles et mémorise le choix', () => {
    const project = useProjectStore();
    expect(project.profile).toBe('grafcet');
    project.setProfile('sfc');
    expect(project.profile).toBe('sfc');
    expect(localStorage.getItem('grafcet-studio-v1-profile')).toBe('sfc');
    setActivePinia(createPinia());
    expect(useProjectStore().profile).toBe('sfc');
  });
});

describe('étape citée dans des réceptivités', () => {
  it('surligne les transitions qui citent l’étape sélectionnée, ici et dans les autres GRAFCET', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const xml = readFileSync(resolve(process.cwd(), '../../fixtures/sfcedit/convergence-et-renvoi.xml'), 'utf8');
    const ui = useUiStore();
    const project = useProjectStore();
    ui.importText = xml;
    ui.applyImport('x.xml');
    const [g1, g2] = project.project.grafcets;
    // Grafcet cite X15 (étape de Grafcet1) ; Grafcet1 cite X2, X9, X4, X11 (étapes de Grafcet)
    project.activeId = g2!.id;
    ui.sel = N(g2!)[0]!.id; // étape 15
    await new Promise((r) => setTimeout(r, 0));
    expect(ui.linkedNum).toBe('15');
    expect(ui.citedIn.map((c) => c.gid)).toEqual([g1!.id]);
    expect(ui.citedIn[0]!.count).toBe(2); // « X15 » et « /X13.X15 »
    expect(ui.citingActive.size).toBe(0);
    // sélection de l'étape 2 dans Grafcet : citée par la transition de Grafcet1
    project.activeId = g1!.id;
    const s2 = N(g1!).find((i) => i.kind === 'step' && i.num === '2')!;
    ui.sel = s2.id;
    await new Promise((r) => setTimeout(r, 0));
    expect(ui.citedIn.map((c) => c.gid)).toEqual([g2!.id]);
  });
});

describe('macro-étapes', () => {
  it('transforme une étape en macro-étape, crée puis ouvre son expansion, avec annulation', () => {
    const ui = useUiStore();
    const project = useProjectStore();
    const step = N(project.activeG).find((i) => i.kind === 'step' && !i.initial) ?? N(project.activeG)[0]!;
    ui.sel = step.id;
    const n = project.project.grafcets.length;
    ui.toggleMacro(true);
    ui.makeExpansion();
    expect(project.project.grafcets).toHaveLength(n + 1);
    expect(project.activeG.name).toMatch(/Expansion|expansion/i);
    expect(project.issues.map((i) => i.key)).not.toContain('v_expansion_entry');
    project.undo();
    expect(project.project.grafcets).toHaveLength(n);
  });
});
