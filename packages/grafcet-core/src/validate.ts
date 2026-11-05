import { checkSeq } from './grammar';
import { flatten } from './flatten';
import { parseRecept } from './recept';
import { walkAll } from './tree';
import type { Grafcet, Message } from './types';

export type IssueLevel = 'error' | 'warning';

/** Problème détecté : clé de message + paramètres (le texte est produit par l'interface). */
export interface Issue {
  level: IssueLevel;
  key: string;
  params?: Record<string, string | number | Message>;
  /** Élément concerné, ou null pour un problème global. */
  id: string | null;
}

export interface ValidateOptions {
  /**
   * Numéros d'étapes connus dans le reste du projet. Une réceptivité peut tester l'état d'une étape d'un autre GRAFCET
   * (par exemple X15 dans un autre GRAFCET du projet) : ces références ne sont pas signalées comme manquantes.
   */
  knownSteps?: Iterable<number>;
}

export function validateGrafcet(g: Grafcet, opts: ValidateOptions = {}): Issue[] {
  const external = new Set<number>(opts.knownSteps ?? []);
  const issues: Issue[] = [];
  const steps: Extract<Grafcet['items'][number], { kind: 'step' }>[] = [];
  const transitions: Extract<Grafcet['items'][number], { kind: 'trans' }>[] = [];
  const jumps: Extract<Grafcet['items'][number], { kind: 'jump' }>[] = [];
  walkAll(g.items, (it) => {
    if (it.kind === 'step') steps.push(it);
    else if (it.kind === 'trans') transitions.push(it);
    else if (it.kind === 'jump') jumps.push(it);
  });
  if (!steps.some((s) => s.initial)) issues.push({ level: 'error', key: 'v_noinit', id: null });
  const seen = new Map<number, string>();
  for (const s of steps) {
    if (seen.has(s.num)) issues.push({ level: 'error', key: 'v_dupnum', params: { n: s.num }, id: s.id });
    seen.set(s.num, s.id);
    for (const a of s.actions) {
      if (!a.label.trim()) issues.push({ level: 'warning', key: 'v_act_label', params: { n: s.num }, id: s.id });
      if (a.kind === 'conditional' && !(a.cond || '').trim()) issues.push({ level: 'warning', key: 'v_act_cond', params: { n: s.num }, id: s.id });
    }
  }
  for (const t of transitions) {
    if (!t.recept.trim()) { issues.push({ level: 'warning', key: 'v_recept_empty', params: { n: t.num }, id: t.id }); continue; }
    const r = parseRecept(t.recept);
    if (!r.ok) issues.push({ level: 'error', key: 'v_recept_err', params: { n: t.num, e: r.error! }, id: t.id });
    else for (const n of r.refs) if (!seen.has(n) && !external.has(n)) issues.push({ level: 'warning', key: 'v_step_missing', params: { n: t.num, m: n }, id: t.id });
  }
  const ids = new Set<string>();
  walkAll(g.items, (it) => ids.add(it.id));
  for (const j of jumps) if (!j.target || !ids.has(j.target)) issues.push({ level: 'error', key: 'v_jump_broken', id: j.id });
  const fg = flatten(g);
  const nodeName = (n: { kind: string; num: number }): Message => ({ key: n.kind === 'step' ? 'd_step' : 'd_trans', params: { n: n.num } });
  const out = new Map<string, number>();
  for (const l of fg.links) out.set(l.from, (out.get(l.from) || 0) + 1);
  for (const n of fg.nodes) if (!out.has(n.id)) issues.push({ level: 'warning', key: 'v_dead_end', params: { x: nodeName(n) }, id: n.id });
  const adj = new Map<string, string[]>();
  for (const l of fg.links) { if (!adj.has(l.from)) adj.set(l.from, []); adj.get(l.from)!.push(l.to); }
  const reach = new Set<string>();
  const queue = steps.filter((s) => s.initial).map((s) => s.id);
  while (queue.length) {
    const x = queue.pop()!;
    if (reach.has(x)) continue;
    reach.add(x);
    for (const y of adj.get(x) || []) queue.push(y);
  }
  if (reach.size) for (const n of fg.nodes) if (!reach.has(n.id)) issues.push({ level: 'warning', key: 'v_unreachable', params: { x: nodeName(n) }, id: n.id });
  const e = checkSeq(g.items, 'root');
  if (e) issues.push({ level: 'error', key: 'v_structure', params: { e: { key: e } }, id: null });
  return issues;
}
