import { checkGraph, flatten, nodesOf } from './graph';
import { parseRecept } from './recept';
import type { Grafcet, Message, Project } from './types';
import { expansionReaches, macrosOf } from './macro';
import { DEFAULT_PROFILE, profileIssues, type ValidationProfile } from './profiles';

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
  knownSteps?: Iterable<string>;
  /** Profil de vérification (défaut : `grafcet`). */
  profile?: ValidationProfile;
  /** Projet complet : permet de contrôler les macro-étapes et leurs expansions (inter-GRAFCET). */
  project?: Project;
}

export function validateGrafcet(g: Grafcet, opts: ValidateOptions = {}): Issue[] {
  const external = new Set<string>(opts.knownSteps ?? []);
  const issues: Issue[] = [];
  const all = nodesOf(g);
  const steps = all.filter((n): n is Extract<typeof n, { kind: 'step' }> => n.kind === 'step');
  const transitions = all.filter((n): n is Extract<typeof n, { kind: 'trans' }> => n.kind === 'trans');
  const fg = flatten(g);
  const incoming = new Set(fg.links.map((l) => l.to));
  const sources = transitions.filter((t) => !incoming.has(t.id));
  const entries = steps.filter((s) => s.role === 'entry'), exits = steps.filter((s) => s.role === 'exit');
  const isExpansion = !!opts.project && opts.project.grafcets.some((x) => x.id !== g.id && macrosOf(x).some((m) => m.expansion === g.id));
  if (!steps.some((s) => s.initial) && !entries.length && !sources.length) issues.push({ level: 'error', key: 'v_noinit', id: null });
  if (isExpansion || entries.length || exits.length) {
    if (entries.length !== 1) issues.push({ level: 'error', key: 'v_expansion_entry', params: { n: entries.length }, id: entries[1]?.id ?? null });
    if (exits.length !== 1) issues.push({ level: 'error', key: 'v_expansion_exit', params: { n: exits.length }, id: exits[1]?.id ?? null });
  }
  for (const m of macrosOf(g)) {
    if (m.actions.length) issues.push({ level: 'warning', key: 'v_macro_actions', params: { n: m.num }, id: m.id });
    if (m.expansion == null) { issues.push({ level: 'error', key: 'v_macro_no_expansion', params: { n: m.num }, id: m.id }); continue; }
    if (!opts.project) continue;
    if (!opts.project.grafcets.some((x) => x.id === m.expansion)) issues.push({ level: 'error', key: 'v_macro_expansion_missing', params: { n: m.num }, id: m.id });
    else if (expansionReaches(opts.project, m.expansion, g.id)) issues.push({ level: 'error', key: 'v_macro_cycle', params: { n: m.num }, id: m.id });
    else if (opts.project.grafcets.some((x) => x.id !== g.id && macrosOf(x).some((o) => o.expansion === m.expansion)) || macrosOf(g).some((o) => o !== m && o.expansion === m.expansion)) {
      issues.push({ level: 'warning', key: 'v_macro_shared', params: { n: m.num }, id: m.id });
    }
  }
  const seen = new Map<string, string>();
  for (const s of steps) {
    if (!/^[\p{L}\p{N}_]+$/u.test(s.num)) issues.push({ level: 'error', key: 'v_num_bad', params: { n: s.num }, id: s.id });
    if (seen.has(s.num)) issues.push({ level: 'error', key: 'v_dupnum', params: { n: s.num }, id: s.id });
    seen.set(s.num, s.id);
    for (const a of s.actions) {
      if (!a.label.trim()) issues.push({ level: 'warning', key: 'v_act_label', params: { n: s.num }, id: s.id });
      const withCond = a.kind === 'conditional' || a.kind === 'event';
      if (withCond && !(a.cond || '').trim()) issues.push({ level: 'warning', key: 'v_act_cond', params: { n: s.num }, id: s.id });
      if (a.kind === 'event' && (a.cond || '').trim() && !/[↑↓^]/.test(a.cond)) issues.push({ level: 'warning', key: 'v_event_no_edge', params: { n: s.num }, id: s.id });
      if ((a.kind === 'continue' || a.kind === 'conditional') && /:=|←/.test(a.label)) issues.push({ level: 'warning', key: 'v_assign_continuous', params: { n: s.num }, id: s.id });
    }
  }
  const known = new Set<string>([...external, ...steps.map((x) => x.num)]);
  for (const t of transitions) {
    if (!t.recept.trim()) { issues.push({ level: 'warning', key: 'v_recept_empty', params: { n: t.num }, id: t.id }); continue; }
    const r = parseRecept(t.recept, known);
    if (!r.ok) issues.push({ level: 'error', key: 'v_recept_err', params: { n: t.num, e: r.error! }, id: t.id });
    else for (const n of r.refs) if (!seen.has(n) && !external.has(n)) issues.push({ level: 'warning', key: 'v_step_missing', params: { n: t.num, m: n }, id: t.id });
  }
  for (const j of g.jumps) if (!j.to) issues.push({ level: 'error', key: 'v_jump_broken', id: j.id });
  for (const s of g.seqs) if (!s.items.length) issues.push({ level: 'warning', key: 'v_empty_seq', id: s.id });
  const nodeName = (n: { kind: string; num: string | number }): Message => ({ key: n.kind === 'step' ? 'd_step' : 'd_trans', params: { n: n.num } });
  const out = new Map<string, number>();
  for (const l of fg.links) out.set(l.from, (out.get(l.from) || 0) + 1);
  const exitIds = new Set(exits.map((x) => x.id));
  // Une transition sans étape aval est une transition puits : légitime.
  for (const n of fg.nodes) if (n.kind === 'step' && !out.has(n.id) && !exitIds.has(n.id)) issues.push({ level: 'warning', key: 'v_dead_end', params: { x: nodeName(n) }, id: n.id });
  const adj = new Map<string, string[]>();
  for (const l of fg.links) { if (!adj.has(l.from)) adj.set(l.from, []); adj.get(l.from)!.push(l.to); }
  const reach = new Set<string>();
  const queue = steps.filter((s) => s.initial || s.role === 'entry').map((s) => s.id);
  for (const t of sources) queue.push(t.id);
  while (queue.length) {
    const x = queue.pop()!;
    if (reach.has(x)) continue;
    reach.add(x);
    for (const y of adj.get(x) || []) queue.push(y);
  }
  if (reach.size) for (const n of fg.nodes) if (!reach.has(n.id)) issues.push({ level: 'warning', key: 'v_unreachable', params: { x: nodeName(n) }, id: n.id });
  const e = checkGraph(g);
  if (e) issues.push({ level: 'error', key: 'v_structure', params: { e: { key: e } }, id: null });
  issues.push(...profileIssues(g, opts.profile ?? DEFAULT_PROFILE));
  return issues;
}
