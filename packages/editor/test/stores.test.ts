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
