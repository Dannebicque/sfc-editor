import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { checkSeq } from '@grafcet/core';
import { applyLang } from '../src/i18n';
import { useProjectStore } from '../src/stores/project';
import { useUiStore } from '../src/stores/ui';

beforeEach(() => {
  localStorage.clear();
  applyLang('fr');
  setActivePinia(createPinia());
});

describe('commandes utilisateur', () => {
  it('insère, annule et rétablit en gardant la structure valide', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    project.activeId = project.project.grafcets[1]!.id;
    const g = () => project.activeG;
    ui.sel = g().items[1]!.id; // transition 1
    const n = g().items.length;
    ui.insertKind('step');
    expect(g().items.length).toBe(n + 2);
    expect(checkSeq(g().items, 'root')).toBeNull();
    project.undo();
    expect(g().items.length).toBe(n);
    project.redo();
    expect(g().items.length).toBe(n + 2);
  });
  it('refuse une insertion interdite sans modifier le document', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    ui.sel = project.activeG.items[0]!.id; // étape : on ne peut pas insérer une étape juste après
    const before = JSON.stringify(project.project);
    ui.insertKind('step');
    expect(JSON.stringify(project.project)).toBe(before);
    expect(project.past.length).toBe(0);
  });
  it('regroupe les frappes consécutives d’un même champ en une seule entrée d’historique', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    ui.sel = project.activeG.items[1]!.id;
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
    ui.sel = project.activeG.items[2]!.id;
    const n = project.activeG.items.length;
    ui.removeSel();
    expect(project.activeG.items.length).toBeLessThan(n);
    expect(ui.sel).not.toBeNull();
  });
  it('importe un projet natif exporté (aller-retour)', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    ui.dataView = 'native';
    const text = ui.dataText;
    ui.importText = text;
    ui.applyImport();
    expect(ui.importMsg.cls).toBe('ok');
    expect(project.project.grafcets.length).toBe(3);
  });
  it('retraduit la démonstration intacte quand la langue change, mais pas un projet modifié', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    ui.setLang('en');
    expect(project.project.name).toBe('Demo project');
    ui.sel = project.activeG.items[1]!.id;
    ui.setField('recept', 'zzz');
    ui.setLang('fr');
    expect(project.project.name).toBe('Demo project');
  });
});

describe('édition 1b (store)', () => {
  it('Maj + lettre insère de l’autre côté', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    project.activeId = project.project.grafcets[1]!.id;
    const g = () => project.activeG;
    const s1 = g().items[2]!;
    ui.sel = s1.id;
    const idxOf = () => g().items.findIndex((i) => i.id === s1.id);
    const idx = idxOf();
    ui.insertKind('step', true); // avant
    expect(idxOf()).toBe(idx + 2); // étape + transition intercalaire insérées avant s1
    expect(checkSeq(g().items, 'root')).toBeNull();
  });
  it('la barre de divergence impose « avant », la convergence « après »', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    const or = project.activeG.items.find((i) => i.kind === 'or')!;
    ui.sel = or.id + ':d';
    expect(ui.whereNow).toBe('before');
    expect(ui.whereFixed).toBe(true);
    expect(ui.allowed.length).toBeGreaterThan(0);
    ui.sel = or.id;
    expect(ui.whereNow).toBe('after');
  });
  it('encadre, dissout et déplace avec annulation possible', () => {
    const project = useProjectStore();
    const ui = useUiStore();
    project.activeId = project.project.grafcets[1]!.id;
    ui.sel = project.activeG.items[2]!.id;
    expect(ui.canWrap('or')).toBe(true);
    ui.wrap('or');
    const b = project.activeG.items.find((i) => i.kind === 'or');
    expect(b).toBeTruthy();
    expect(checkSeq(project.activeG.items, 'root')).toBeNull();
    expect(ui.canMoveBranch(1)).toBe(false); // la nouvelle branche est la dernière
    expect(ui.canMoveBranch(-1)).toBe(true);
    ui.moveBranch(-1);
    ui.sel = b!.id;
    expect(ui.canUnwrap(0)).toBe(true);
    ui.unwrap(0);
    expect(project.activeG.items.some((i) => i.kind === 'or')).toBe(false);
    project.undo();
    expect(project.activeG.items.some((i) => i.kind === 'or')).toBe(true);
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
    ui.sel = g1!.items[0]!.id;
    await Promise.resolve();
    expect(ui.linkedIn).toEqual([]);
    // une étape de même identifiant dans les deux GRAFCET
    project.mutate((g) => { const s = g.items[0]; if (s && s.kind === 'step') s.num = '15'; });
    ui.sel = null; ui.sel = g1!.items[0]!.id;
    await new Promise((r) => setTimeout(r, 0));
    expect(ui.linkedNum).toBe('15');
    expect(ui.linkedIn.map((l) => l.gid)).toEqual([g2!.id]);
    expect(ui.sharedNum).toBe('15');
    ui.openG(g2!.id);
    await new Promise((r) => setTimeout(r, 20));
    expect(g2!.items.find((i) => i.id === ui.sel)).toMatchObject({ kind: 'step', num: '15' });
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
    ui.sel = g2!.items[0]!.id; // étape 15
    await new Promise((r) => setTimeout(r, 0));
    expect(ui.linkedNum).toBe('15');
    expect(ui.citedIn.map((c) => c.gid)).toEqual([g1!.id]);
    expect(ui.citedIn[0]!.count).toBe(2); // « X15 » et « /X13.X15 »
    expect(ui.citingActive.size).toBe(0);
    // sélection de l'étape 2 dans Grafcet : citée par la transition de Grafcet1
    project.activeId = g1!.id;
    const s2 = g1!.items.flatMap((i) => (i.kind === 'and' ? i.branches.flat() : [i])).find((i) => i.kind === 'step' && i.num === '2')!;
    ui.sel = s2.id;
    await new Promise((r) => setTimeout(r, 0));
    expect(ui.citedIn.map((c) => c.gid)).toEqual([g2!.id]);
  });
});
