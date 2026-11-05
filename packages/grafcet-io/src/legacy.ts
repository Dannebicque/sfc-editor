import { checkGraph, nodesOf, treeToGraph, type Grafcet, type Project, type TreeGrafcet } from '@grafcet/core';
import { ImportError, type ImportResult } from './contract';

/** Résultat d'un import « JSON libre » : le projet à utiliser et le GRAFCET à ouvrir. */
export interface JsonImport { project: Project; activeId: string }

const maxId = (g: Grafcet) => {
  let m = 0;
  const seen = (id: string) => { const r = /^[nqlj](\d+)$/.exec(id || ''); if (r) m = Math.max(m, +r[1]!); };
  for (const s of g.seqs) { seen(s.id); for (const it of s.items) seen(it.id); }
  for (const l of g.links) seen(l.id);
  for (const j of g.jumps) seen(j.id);
  return m;
};

/**
 * Valide et complète un GRAFCET issu d'un JSON saisi à la main ou du prototype (champs absents → valeurs par défaut).
 * Accepte l'ancien format en arbre (`items`), converti en séquences + liens, et le format `seqs`/`links`/`jumps`.
 */
function normalizeGrafcet(raw: any, counter: { counter: number }): Grafcet {
  if (!raw || (!Array.isArray(raw.items) && !Array.isArray(raw.seqs))) throw new ImportError({ key: 'imp_items' });
  const name = raw.name || '';
  let g: Grafcet;
  if (Array.isArray(raw.items)) {
    const t = raw as TreeGrafcet;
    t.name = name; t.nextStep = t.nextStep ?? 0; t.nextTrans = t.nextTrans ?? 1;
    g = treeToGraph(t, counter);
  } else {
    g = raw as Grafcet;
    g.links = g.links || [];
    g.jumps = g.jumps || [];
  }
  const ids = new Set<string>();
  for (const it of nodesOf(g)) {
    if (!it.id || ids.has(it.id)) throw new ImportError({ key: 'imp_ids', params: { g: name || '?' } });
    ids.add(it.id);
  }
  g.name = name;
  for (const it of nodesOf(g)) {
    if (it.kind === 'step') { it.num = String((it as { num: unknown }).num ?? ''); it.actions = it.actions || []; it.name = it.name || ''; it.initial = !!it.initial; }
    if (it.kind === 'trans') it.recept = it.recept || '';
  }
  const e = checkGraph(g);
  if (e) throw new ImportError({ key: 'imp_struct', params: { g: name || '?', e: { key: e } } });
  let maxStep = -1, maxTrans = 0;
  for (const it of nodesOf(g)) {
    if (it.kind === 'step' && /^\d+$/.test(it.num)) maxStep = Math.max(maxStep, +it.num);
    if (it.kind === 'trans') maxTrans = Math.max(maxTrans, it.num);
  }
  g.nextStep = Math.max(g.nextStep ?? 0, maxStep + 1);
  g.nextTrans = Math.max(g.nextTrans ?? 1, maxTrans + 1);
  return g;
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
    const counter = { counter: 1 + 1000 };
    const grafcets = o.grafcets.map((g: any, i: number) => { g.id = g.id || 'g' + (i + 1); const x = normalizeGrafcet(g, counter); if (!x.name) x.name = defaults.grafcetName; return x; });
    const project: Project = { name: o.name || defaults.projectName, grafcets, gcount: grafcets.length + 1 + 100, counter: counter.counter };
    return { model: { project, activeId: project.grafcets[0]!.id }, report: { entries: [] } };
  }
  const next: Project = JSON.parse(JSON.stringify(current));
  const g = normalizeGrafcet(o, next);
  if (!g.name) g.name = defaults.grafcetName;
  g.id = 'g' + next.gcount++;
  next.counter = Math.max(next.counter, 1 + maxId(g));
  next.grafcets.push(g);
  return { model: { project: next, activeId: g.id }, report: { entries: [] } };
}
