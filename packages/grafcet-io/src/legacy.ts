import { checkSeq, walkAll, type Grafcet, type Item, type Project } from '@grafcet/core';
import { ImportError, type ImportResult } from './contract';

/** Résultat d'un import « JSON libre » : le projet à utiliser et le GRAFCET à ouvrir. */
export interface JsonImport { project: Project; activeId: string }

const maxItemId = (items: Item[]) => {
  let m = 0;
  walkAll(items, (it) => { const r = /^n(\d+)$/.exec(it.id || ''); if (r) m = Math.max(m, +r[1]!); });
  return m;
};

/** Valide et complète un GRAFCET issu d'un JSON saisi à la main ou du prototype (champs absents → valeurs par défaut). */
function normalizeGrafcet(g: Grafcet): void {
  if (!g || !Array.isArray(g.items)) throw new ImportError({ key: 'imp_items' });
  const e = checkSeq(g.items, 'root');
  if (e) throw new ImportError({ key: 'imp_struct', params: { g: g.name || '?', e: { key: e } } });
  const ids = new Set<string>();
  walkAll(g.items, (it) => {
    if (!it.id || ids.has(it.id)) throw new ImportError({ key: 'imp_ids', params: { g: g.name || '?' } });
    ids.add(it.id);
  });
  g.name = g.name || '';
  walkAll(g.items, (it) => {
    if (it.kind === 'step') { it.num = String((it as { num: unknown }).num ?? ''); it.actions = it.actions || []; it.name = it.name || ''; it.initial = !!it.initial; }
    if (it.kind === 'trans') it.recept = it.recept || '';
  });
  let maxStep = -1, maxTrans = 0;
  walkAll(g.items, (it) => {
    if (it.kind === 'step' && /^\d+$/.test(it.num)) maxStep = Math.max(maxStep, +it.num);
    if (it.kind === 'trans') maxTrans = Math.max(maxTrans, it.num);
  });
  g.nextStep = Math.max(g.nextStep ?? 0, maxStep + 1);
  g.nextTrans = Math.max(g.nextTrans ?? 1, maxTrans + 1);
}

/**
 * Import « JSON libre » du prototype : soit un projet (`{ name, grafcets: [...] }`, qui remplace le projet courant),
 * soit un seul GRAFCET (ajouté au projet courant).
 * `defaults` fournit les libellés à utiliser quand `name` est absent (le noyau ne traduit rien).
 */
export function importJson(
  text: string,
  current: Project,
  defaults: { grafcetName: string; projectName: string },
): ImportResult<JsonImport> {
  let o: any;
  try { o = JSON.parse(text); } catch (e) { throw new ImportError({ key: 'imp_raw', params: { m: String((e as Error).message) } }); }
  if (!o || typeof o !== 'object') throw new ImportError({ key: 'imp_items' });
  if (Array.isArray(o.grafcets)) {
    if (!o.grafcets.length) throw new ImportError({ key: 'imp_empty' });
    o.grafcets.forEach((g: Grafcet, i: number) => { g.id = g.id || 'g' + (i + 1); normalizeGrafcet(g); if (!g.name) g.name = defaults.grafcetName; });
    const project: Project = {
      name: o.name || defaults.projectName,
      grafcets: o.grafcets,
      gcount: o.grafcets.length + 1 + 100,
      counter: 1 + Math.max(0, ...o.grafcets.map((g: Grafcet) => maxItemId(g.items))),
    };
    return { model: { project, activeId: project.grafcets[0]!.id }, report: { entries: [] } };
  }
  normalizeGrafcet(o);
  if (!o.name) o.name = defaults.grafcetName;
  const next: Project = JSON.parse(JSON.stringify(current));
  o.id = 'g' + next.gcount++;
  next.counter = Math.max(next.counter, 1 + maxItemId(o.items));
  next.grafcets.push(o);
  return { model: { project: next, activeId: o.id }, report: { entries: [] } };
}
