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
