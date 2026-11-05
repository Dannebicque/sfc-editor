import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  checkSeq, DEFAULT_PROFILE, isProfile, duplicateGrafcet, findItem, flatten, newGrafcet, parseRecept, stats as statsOf, validateGrafcet, walkAll,
  type Grafcet, type Project, type ValidationProfile,
} from '@grafcet/core';
import { LS_PREFIX, T, lang } from '../i18n';
import { demoProject, syncDemo } from '../demo';
import { useUiStore } from './ui';

const STORAGE_KEY = LS_PREFIX;
const PROFILE_KEY = LS_PREFIX + '-profile';

/**
 * Profil de vérification par défaut. Aujourd'hui : le dernier choix local, sinon `grafcet`.
 * Point d'extension prévu : un profil par défaut lié au compte connecté (voir la phase « serveur »).
 */
function defaultProfile(): ValidationProfile {
  try { const v = localStorage.getItem(PROFILE_KEY); if (isProfile(v)) return v; } catch { /* ignoré */ }
  return DEFAULT_PROFILE;
}

interface HistoryEntry { p: string; sel: string | null; a: string }

function loadSaved(): { project: Project; activeId: string } | null {
  try {
    const o = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (o && o.project && Array.isArray(o.project.grafcets) && o.project.grafcets.length
      && o.project.grafcets.every((g: Grafcet) => Array.isArray(g.items) && !checkSeq(g.items, 'root'))) return o;
  } catch { /* stockage indisponible ou contenu invalide */ }
  return null;
}

/**
 * Document (projet) + historique annuler/rétablir + persistance locale.
 * Toute modification passe par `mutate` : on travaille sur une copie, et on ne crée une entrée d'historique que si le projet a changé.
 */
export const useProjectStore = defineStore('project', () => {
  const saved = loadSaved();
  const project = ref<Project>(syncDemo(saved ? saved.project : demoProject(lang.value), lang.value));
  const activeId = ref<string>(
    saved && project.value.grafcets.some((g) => g.id === saved.activeId) ? saved.activeId : project.value.grafcets[0]!.id,
  );
  const past = ref<HistoryEntry[]>([]);
  const future = ref<HistoryEntry[]>([]);
  const coalesce = { key: null as string | null, t: 0 };

  const profile = ref<ValidationProfile>(defaultProfile());
  function setProfile(p: ValidationProfile): void {
    profile.value = p;
    try { localStorage.setItem(PROFILE_KEY, p); } catch { /* ignoré */ }
  }

  const activeG = computed<Grafcet>(() => project.value.grafcets.find((g) => g.id === activeId.value) ?? project.value.grafcets[0]!);
  /** Numéros d'étapes de tout le projet : une réceptivité peut référencer une étape d'un autre GRAFCET (Xn). */
  const knownSteps = computed(() => {
    const out = new Set<string>();
    for (const g of project.value.grafcets) walkAll(g.items, (it) => { if (it.kind === 'step') out.add(it.num); });
    return out;
  });
  const issues = computed(() => validateGrafcet(activeG.value, { knownSteps: knownSteps.value, profile: profile.value }));
  const issueErr = computed(() => issues.value.filter((i) => i.level === 'error').length);
  const flat = computed(() => flatten(activeG.value));
  const stats = computed(() => statsOf(activeG.value));
  const sums = computed(() => {
    const o: Record<string, { steps: number; trans: number; err: number; warn: number }> = {};
    for (const g of project.value.grafcets) {
      const s = statsOf(g);
      const iss = validateGrafcet(g, { knownSteps: knownSteps.value, profile: profile.value });
      o[g.id] = { steps: s.steps, trans: s.trans, err: iss.filter((i) => i.level === 'error').length, warn: iss.filter((i) => i.level === 'warning').length };
    }
    return o;
  });
  const varList = computed(() => {
    const set = new Set<string>();
    walkAll(activeG.value.items, (it) => {
      if (it.kind === 'trans' && it.recept) parseRecept(it.recept).vars.forEach((v) => set.add(v));
      if (it.kind === 'step') it.actions.forEach((a) => { if (a.label) set.add(a.label); });
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  function persist(): void {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ project: project.value, activeId: activeId.value })); } catch { /* ignoré */ }
    }, 400);
  }

  /** Applique `fn` sur une copie du projet (et du GRAFCET actif). Renvoie le résultat de `fn`. */
  function mutate<R>(fn: (g: Grafcet, P: Project) => R, opts: { key?: string } = {}): R {
    const ui = useUiStore();
    const before = JSON.stringify(project.value);
    const draft: Project = JSON.parse(before);
    const g = draft.grafcets.find((x) => x.id === activeId.value)!;
    const res = fn(g, draft);
    if (JSON.stringify(draft) === before) return res;
    const now = performance.now();
    if (!(opts.key && coalesce.key === opts.key && now - coalesce.t < 900)) {
      past.value.push({ p: before, sel: ui.sel, a: activeId.value });
      if (past.value.length > 200) past.value.shift();
    }
    coalesce.key = opts.key || null;
    coalesce.t = now;
    future.value = [];
    project.value = draft;
    persist();
    return res;
  }

  function restore(e: HistoryEntry): void {
    const ui = useUiStore();
    project.value = JSON.parse(e.p);
    activeId.value = project.value.grafcets.some((g) => g.id === e.a) ? e.a : project.value.grafcets[0]!.id;
    ui.sel = e.sel && findItem(activeG.value.items, e.sel.replace(':d', '')) ? e.sel : null;
    coalesce.key = null;
    persist();
  }
  function undo(): void {
    const ui = useUiStore();
    const e = past.value.pop();
    if (!e) return;
    future.value.push({ p: JSON.stringify(project.value), sel: ui.sel, a: activeId.value });
    restore(e);
    ui.announce(T('a_undo'));
  }
  function redo(): void {
    const ui = useUiStore();
    const e = future.value.pop();
    if (!e) return;
    past.value.push({ p: JSON.stringify(project.value), sel: ui.sel, a: activeId.value });
    restore(e);
    ui.announce(T('a_redo'));
  }

  /** Remplace le projet en conservant l'historique (utilisé par l'import). */
  function replaceProject(next: Project): void {
    const ui = useUiStore();
    past.value.push({ p: JSON.stringify(project.value), sel: ui.sel, a: activeId.value });
    future.value = [];
    project.value = next;
    persist();
  }

  function renameGrafcet(v: string): void { mutate((g) => { g.name = v; }, { key: 'rg' }); }
  function renameProject(v: string): void { mutate((_g, P) => { P.name = v; }, { key: 'rp' }); }
  function addGrafcet(): string {
    return mutate((_g, P) => {
      const ng = newGrafcet(P, 'GRAFCET ' + (P.grafcets.length + 1));
      P.grafcets.push(ng);
      return ng.id;
    });
  }
  function dupGrafcet(): string {
    return mutate((g, P) => {
      const c = duplicateGrafcet(P, g, g.name + T('g_copy'));
      P.grafcets.push(c);
      return c.id;
    });
  }
  function delGrafcet(): string | null {
    if (project.value.grafcets.length < 2) return null;
    return mutate((g, P) => {
      const i = P.grafcets.findIndex((x) => x.id === g.id);
      P.grafcets.splice(i, 1);
      return P.grafcets[Math.max(0, i - 1)]!.id;
    });
  }

  /** Quand la langue change, un projet resté identique à la démo est retraduit (l'historique est alors réinitialisé). */
  function syncDemoLanguage(): void {
    const swapped = syncDemo(project.value, lang.value);
    if (swapped !== project.value) {
      project.value = swapped;
      past.value = [];
      future.value = [];
      coalesce.key = null;
      persist();
    }
  }

  return {
    project, activeId, activeG, profile, setProfile, knownSteps, past, future, issues, issueErr, flat, stats, sums, varList,
    persist, mutate, undo, redo, replaceProject, renameGrafcet, renameProject, addGrafcet, dupGrafcet, delGrafcet, syncDemoLanguage,
  };
});
