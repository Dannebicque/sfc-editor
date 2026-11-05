import { findItem, walkAll, walkGrafcet, findInGrafcet } from './tree';
import { mkStep, mkTrans } from './insertion';
import type { Grafcet, Project, Step } from './types';

/** Une étape est une macro-étape si elle a une expansion (ou en attend une : `null`). */
export const isMacro = (s: Step): boolean => s.expansion !== undefined;

/** Les macro-étapes d'un GRAFCET. */
export function macrosOf(g: Grafcet): Step[] {
  const out: Step[] = [];
  walkGrafcet(g, (it) => { if (it.kind === 'step' && isMacro(it)) out.push(it); });
  return out;
}

/** Transforme une étape en macro-étape (sans expansion) ou la redevient une étape ordinaire. Renvoie false si impossible. */
export function setMacro(g: Grafcet, stepId: string, on: boolean): boolean {
  const it = findInGrafcet(g, stepId);
  if (!it || it.kind !== 'step') return false;
  if (on) { if (it.expansion === undefined) { it.expansion = null; it.actions = []; } } else delete it.expansion;
  return true;
}

/**
 * Crée l'expansion d'une macro-étape : un GRAFCET avec une étape d'entrée « E<n> » et une étape de sortie « S<n> »
 * reliées par une transition. `name` est le nom du nouveau GRAFCET. Renvoie le GRAFCET créé (déjà ajouté au projet).
 */
export function createExpansion(P: Project, g: Grafcet, stepId: string, name: string): Grafcet | null {
  const it = findInGrafcet(g, stepId);
  if (!it || it.kind !== 'step' || it.expansion === undefined) return null;
  const x: Grafcet = { id: 'g' + P.gcount++, name, nextStep: 0, nextTrans: 1, items: [] };
  const e = mkStep(P, x), t = mkTrans(P, x), s = mkStep(P, x);
  if (e.kind === 'step') { e.num = 'E' + it.num; e.role = 'entry'; }
  if (s.kind === 'step') { s.num = 'S' + it.num; s.role = 'exit'; }
  x.nextStep = 0;
  x.items.push(e, t, s);
  P.grafcets.push(x);
  it.expansion = x.id;
  return x;
}

/** Vrai si suivre les expansions depuis `fromId` ramène à `targetId` (une macro-étape s'inclurait elle-même). */
export function expansionReaches(P: Project, fromId: string, targetId: string): boolean {
  const seen = new Set<string>();
  const visit = (id: string): boolean => {
    if (id === targetId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const g = P.grafcets.find((x) => x.id === id);
    return !!g && macrosOf(g).some((m) => typeof m.expansion === 'string' && visit(m.expansion));
  };
  return visit(fromId);
}
