import * as Y from 'yjs';
import type { Grafcet, Project } from '@grafcet/core';

/**
 * Représentation Yjs d'un projet (ADR 0005). L'unité de fusion est le GRAFCET entier : chaque GRAFCET est une valeur atomique
 * (JSON) de la map « grafcets ». Deux personnes qui éditent des GRAFCETs différents se fusionnent sans perte ; sur un même GRAFCET,
 * le dernier écrit gagne, et le graphe reste toujours un graphe valide produit par l'éditeur (jamais un mélange de deux éditions).
 *
 *   meta    : Y.Map  { name, counter, gcount }
 *   grafcets: Y.Map  id → JSON du GRAFCET
 *   order   : Y.Map  id → position (nombre) ; l'ordre d'affichage est le tri par position puis par identifiant
 */
export const MAP_META = 'meta';
export const MAP_GRAFCETS = 'grafcets';
export const MAP_ORDER = 'order';

/** Origine des transactions locales (pour `Y.UndoManager` et pour ignorer ses propres échos). */
export const LOCAL_ORIGIN = 'local';

const maps = (doc: Y.Doc) => ({ meta: doc.getMap<unknown>(MAP_META), grafcets: doc.getMap<string>(MAP_GRAFCETS), order: doc.getMap<number>(MAP_ORDER) });

/** Plus grand nombre trouvé dans les identifiants d'éléments (n12, q3, l4, j5) : le compteur doit rester au-dessus. */
function maxIdNumber(g: Grafcet): number {
  let m = 0;
  const see = (id: string): void => { const n = Number(/\d+$/.exec(id)?.[0]); if (Number.isFinite(n) && n > m) m = n; };
  for (const s of g.seqs) { see(s.id); for (const it of s.items) see(it.id); }
  for (const l of g.links) see(l.id);
  for (const j of g.jumps) see(j.id);
  return m;
}

/** Lit le projet courant du document. Un GRAFCET illisible est ignoré (le serveur valide avant de persister). */
export function readProject(doc: Y.Doc): Project {
  const { meta, grafcets, order } = maps(doc);
  const list: Array<{ g: Grafcet; pos: number }> = [];
  grafcets.forEach((json, id) => {
    try {
      const g = JSON.parse(json) as Grafcet;
      if (g && g.id === id && Array.isArray(g.seqs)) list.push({ g, pos: order.get(id) ?? Number.MAX_SAFE_INTEGER });
    } catch { /* GRAFCET illisible : ignoré */ }
  });
  list.sort((a, b) => a.pos - b.pos || (a.g.id < b.g.id ? -1 : a.g.id > b.g.id ? 1 : 0));
  const gs = list.map((x) => x.g);
  const counter = Math.max(Number(meta.get('counter')) || 0, ...gs.map((g) => maxIdNumber(g) + 1));
  const gcount = Math.max(Number(meta.get('gcount')) || 0, ...gs.map((g) => (Number(/^g(\d+)/.exec(g.id)?.[1]) || 0) + 1));
  return { name: String(meta.get('name') ?? ''), counter, gcount, grafcets: gs };
}

/**
 * Écrit `next` dans le document en ne touchant que ce qui change (donc en n'envoyant que le delta).
 * Renvoie vrai si le document a été modifié.
 */
export function writeProject(doc: Y.Doc, next: Project, origin: unknown = LOCAL_ORIGIN): boolean {
  const { meta, grafcets, order } = maps(doc);
  let changed = false;
  doc.transact(() => {
    const set = <T>(m: Y.Map<T>, k: string, v: T): void => { if (m.get(k) !== v) { m.set(k, v); changed = true; } };
    set(meta, 'name', next.name);
    set(meta, 'counter', Math.max(Number(meta.get('counter')) || 0, next.counter));
    set(meta, 'gcount', Math.max(Number(meta.get('gcount')) || 0, next.gcount));
    const keep = new Set<string>();
    next.grafcets.forEach((g, i) => {
      keep.add(g.id);
      set(grafcets, g.id, JSON.stringify(g));
      set(order, g.id, i);
    });
    for (const id of [...grafcets.keys()]) if (!keep.has(id)) { grafcets.delete(id); order.delete(id); changed = true; }
  }, origin);
  return changed;
}

export function docFromProject(p: Project): Y.Doc {
  const doc = new Y.Doc();
  writeProject(doc, p, 'init');
  return doc;
}

export const encodeState = (doc: Y.Doc): Uint8Array => Y.encodeStateAsUpdate(doc);
export function docFromState(state: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state, 'init');
  return doc;
}

/** Identifiant de GRAFCET sans collision entre deux clients hors ligne (suffixe aléatoire). */
export const collabGrafcetId = (counter: number): string => 'g' + counter + '-' + Math.random().toString(36).slice(2, 6);
