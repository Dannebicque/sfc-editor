import { checkGraph, isAndBranch, violations, docOrder, indexOf, nodesOf, numberTransitions, type Action, type Grafcet, type Message, type Node, type Project, type Seq } from '@grafcet/core';
import { ImportError, type ExportResult, type ImportResult, type ReportEntry } from './contract';
import { elements, esc, parseXml, textOf, type XNode } from './xml';

/**
 * Adaptateur SFCEdit XML (export de SFCEdit).
 *
 * Format observé : un `project` contient des `grafcet` ; chacun contient des `sequence` (listes linéaires d'étapes et de
 * transitions), des `hlink` (liens de divergence `div and|or` : `seqid` = séquence qui diverge, `node` = branches ;
 * liens de convergence `conv and|or` : `seqid` = séquence qui suit, `node` = branches qui convergent) et des `jump`
 * (renvoi de la fin d'une séquence vers le début d'une autre). Une négation s'écrit `<cpl>…</cpl>` (barre de complément).
 *
 * Extensions propres à SFC Editor, ignorées par SFCEdit : attributs `x-label` (nom de l'étape) et `x-kind`
 * (type d'action) pour que l'aller-retour ne perde rien.
 */

const info = (key: string, params?: Record<string, string | number>): ReportEntry => ({ level: 'info', message: { key, params } });
const warn = (key: string, params?: Record<string, string | number | Message>): ReportEntry => ({ level: 'warning', message: { key, params } });
const err = (key: string, params?: Record<string, string | number | Message>): ReportEntry => ({ level: 'error', message: { key, params } });

/** Heuristique de détection (avant analyse complète). */
export const looksLikeSfcEditXml = (text: string): boolean => /<project[\s>]/.test(text) && /<grafcet[\s>]/.test(text);

/* ------------------------------------------------------------------ import */

const ATOM = /^(?:[A-Za-zÀ-ÿ_][A-Za-z0-9À-ÿ_]*|\d+)$/;

/** Contenu d'une condition SFCEdit → syntaxe de réceptivité de SFC Editor (`<cpl>x</cpl>` devient `/x`). */
function convertCondition(node: XNode, report: ReportEntry[]): string {
  const render = (n: XNode): string =>
    n.children.map((c) => {
      if (typeof c === 'string') return c;
      if (c.tag === 'cpl') {
        const inner = render(c).replace(/\s+/g, ' ').trim();
        return '/' + (ATOM.test(inner) ? inner : '(' + inner + ')');
      }
      report.push(warn('rep_unknown_tag', { tag: c.tag }));
      return render(c);
    }).join('');
  return render(node).replace(/\s+/g, ' ').trim();
}

function importGrafcet(P: Project, gx: XNode, report: ReportEntry[], index: number): Grafcet {
  const nameAttr = gx.attrs.name || `Grafcet ${index + 1}`;
  const g: Grafcet = { id: 'g' + P.gcount++, name: nameAttr, nextStep: 0, nextTrans: 1, seqs: [], links: [], jumps: [] };
  if (gx.attrs.comment) g.comment = gx.attrs.comment;
  if (gx.attrs.type && gx.attrs.type !== 'normal') report.push(warn('rep_grafcet_type', { g: g.name, type: gx.attrs.type }));
  if (gx.attrs.owner) report.push(info('rep_owner', { g: g.name, owner: gx.attrs.owner }));

  /** Identifiants de séquence SFCEdit → séquences. */
  const seqs = new Map<string, Seq>();
  const pendingNumbers: Extract<Node, { kind: 'step' }>[] = [];
  const nid = (p = 'n') => p + P.counter++;

  for (const sx of elements(gx, 'sequence')) {
    const seq: Seq = { id: nid('q'), items: [] };
    for (const c of elements(sx)) {
      if (c.tag === 'step') {
        const rawName = (c.attrs.name ?? '').trim();
        const m = /^X(\d+)$/i.exec(rawName);
        const type = c.attrs.type ?? 'normal';
        if (type !== 'normal' && type !== 'initial') report.push(warn('rep_step_type', { g: g.name, type, name: c.attrs.name ?? '?' }));
        const step: Extract<Node, { kind: 'step' }> = {
          id: nid(), kind: 'step', num: m ? m[1]! : rawName || '', name: c.attrs['x-label'] ?? '', initial: type === 'initial',
          actions: elements(c, 'action').map((a) => importAction(a, g.name, report)),
        };
        if (!rawName) { pendingNumbers.push(step); report.push(warn('rep_step_name', { g: g.name, name: '' })); }
        seq.items.push(step);
      } else if (c.tag === 'transition') {
        const cond = elements(c, 'condition')[0];
        seq.items.push({ id: nid(), kind: 'trans', num: 0, recept: cond ? convertCondition(cond, report) : '' });
      } else report.push(warn('rep_unknown_tag', { tag: c.tag }));
    }
    seqs.set(sx.attrs.id ?? String(seqs.size + 1), seq);
    g.seqs.push(seq);
  }
  const ref = (id: string | undefined): string | null => (id !== undefined && seqs.has(id) ? seqs.get(id)!.id : null);

  for (const h of elements(gx, 'hlink')) {
    const m = /^(div|conv)\s+(and|or)$/i.exec((h.attrs.type ?? '').trim());
    if (!m) { report.push(warn('rep_unknown_tag', { tag: `hlink ${h.attrs.type ?? ''}`.trim() })); continue; }
    const nodes = elements(h, 'node').map((n) => ref(n.attrs.seqid)).filter((x): x is string => !!x);
    const base = h.attrs.seqid ? ref(h.attrs.seqid) : null;
    if (h.attrs.seqid && !base) report.push(err('rep_structure', { g: g.name, e: { key: 'chk_ref' } }));
    if (nodes.length < 2) { report.push(warn('rep_conv_missing', { g: g.name })); continue; }
    g.links.push({ id: nid('l'), kind: m[1]!.toLowerCase() as 'div' | 'conv', op: m[2]!.toLowerCase() as 'and' | 'or', base, nodes });
  }
  const placeholderJumps: { from: Seq; to: Seq }[] = [];
  for (const j of elements(gx, 'jump')) {
    const from = ref(j.attrs.seqid_from), toSeq = seqs.get(j.attrs.seqid_to ?? ''), to = toSeq?.items[0];
    if (!from) continue;
    const fromSeq = seqs.get(j.attrs.seqid_from ?? '')!;
    if (!to && toSeq && !fromSeq.items.length) { placeholderJumps.push({ from: fromSeq, to: toSeq }); continue; }
    if (!to) report.push(err('rep_jump_target', { g: g.name }));
    g.jumps.push({ id: nid('j'), from, to: to?.id ?? null });
  }
  for (const pj of placeholderJumps) {
    if (!resolvePlaceholderJump(g, pj.from, pj.to, nid)) {
      report.push(err('rep_jump_target', { g: g.name }));
      g.jumps.push({ id: nid('j'), from: pj.from.id, to: null });
    } else report.push(info('rep_jump_resolved', { g: g.name }));
  }
  for (const t of gx.children) if (typeof t !== 'string' && !['sequence', 'hlink', 'jump'].includes(t.tag)) report.push(warn('rep_unknown_tag', { tag: t.tag }));

  numberTransitions(g);
  const maxStep = Math.max(-1, ...nodesOf(g).filter((it) => it.kind === 'step' && /^\d+$/.test(it.num)).map((it) => +it.num));
  let n = maxStep;
  for (const s of pendingNumbers) s.num = String(++n);
  g.nextStep = n + 1;
  const e = checkGraph(g);
  if (e) report.push(err('rep_structure', { g: g.name, e: { key: e } }));
  return g;
}

/**
 * SFCEdit exprime « renvoi vers l'étape X » par un renvoi d'une séquence vide (base d'une convergence OU) vers une
 * branche vide d'une convergence OU dont la base commence par X. On le traduit en renvois directs vers X depuis la fin
 * de chaque branche de la première convergence (même sémantique : un OU puis un renvoi). Une branche vide de divergence ET
 * porte alors directement le renvoi (la barre arrive sur l'étape). Les branches vides de la seconde convergence retirées
 * ne sont plus nécessaires ; une convergence qui n'a plus qu'une branche est dissoute de la même façon.
 * Le graphe n'est modifié que si le résultat reste valide ; sinon renvoie false et ne change rien.
 */
function resolvePlaceholderJump(g: Grafcet, from: Seq, to: Seq, nid: (p?: string) => string): boolean {
  const target = g.links.find((l) => l.kind === 'conv' && l.base && l.nodes.includes(to.id));
  const base = target?.base ? g.seqs.find((s) => s.id === target.base) : undefined;
  const goal = base?.items[0];
  const src = g.links.find((l) => l.kind === 'conv' && l.op === 'or' && l.base === from.id);
  if (!target || !goal || goal.kind !== 'step' || !src) return false;
  if (src.nodes.some((n) => !g.seqs.find((s) => s.id === n)?.items.length && !isAndBranch(g, n))) return false;
  const copy = structuredClone({ seqs: g.seqs, links: g.links, jumps: g.jumps });
  const trial: Grafcet = { ...g, ...copy };
  const before = violationCount(g);
  const tl = trial.links.find((l) => l.id === target.id)!;
  tl.nodes = tl.nodes.filter((n) => n !== to.id);
  trial.links = trial.links.filter((l) => l.id !== src.id);
  trial.seqs = trial.seqs.filter((s) => s.id !== from.id && s.id !== to.id);
  const jumps = [...src.nodes];
  if (tl.nodes.length < 2) { jumps.push(...tl.nodes); trial.links = trial.links.filter((l) => l.id !== tl.id); }
  for (const n of jumps) trial.jumps.push({ id: nid('j'), from: n, to: goal.id });
  if (violationCount(trial) > before) return false;
  g.seqs = trial.seqs; g.links = trial.links; g.jumps = trial.jumps;
  return true;
}
const violationCount = (g: Grafcet): number => violations(g).length;

function importAction(a: XNode, gname: string, report: ReportEntry[]): Action {
  const type = a.attrs.type ?? 'normal';
  const textNode = elements(a, 'text')[0];
  const label = (textNode ? textOf(textNode) : textOf(a)).trim();
  const condNode = elements(a, 'condition')[0];
  const cond = condNode ? convertCondition(condNode, report) : '';
  let kind: Action['kind'] = 'continue';
  const ext = a.attrs['x-kind'];
  if (ext === 'activation' || ext === 'deactivation' || ext === 'conditional' || ext === 'event') kind = ext;
  else if (type === 'conditional' || condNode) kind = 'conditional';
  else if (type !== 'normal') report.push(warn('rep_action_type', { g: gname, type }));
  return { kind, label, cond };
}

export interface SfcEditImportOptions {
  /** Nom du projet créé (le XML SFCEdit n'en contient pas) : en général le nom du fichier. */
  projectName: string;
}

/** Importe un export XML de SFCEdit : un projet SFC Editor et un rapport de conversion. */
export function importSfcEditXml(text: string, opts: SfcEditImportOptions): ImportResult<Project> {
  let root: XNode;
  try { root = parseXml(text); } catch (e) { throw new ImportError({ key: 'imp_sfcedit', params: { m: String((e as Error).message) } }); }
  if (root.tag !== 'project') throw new ImportError({ key: 'imp_sfcedit_root' });
  const report: ReportEntry[] = [];
  const P: Project = { name: opts.projectName, counter: 1, gcount: 1, grafcets: [] };
  elements(root, 'grafcet').forEach((gx, i) => P.grafcets.push(importGrafcet(P, gx, report, i)));
  if (!P.grafcets.length) throw new ImportError({ key: 'imp_empty' });
  return { model: P, report: { entries: dedupe(report) } };
}

function dedupe(entries: ReportEntry[]): ReportEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => { const k = JSON.stringify(e); if (seen.has(k)) return false; seen.add(k); return true; });
}

/* ------------------------------------------------------------------ export */

const TIMER = /^(?:t\d*\/X\d+\/\d+(?:[.,]\d+)?\s?(?:ms|s|min)|\d+(?:[.,]\d+)?\s?(?:ms|s|min)\/X\d+)(?![\w])/i;
const IDENT = /^[A-Za-zÀ-ÿ_][A-Za-z0-9À-ÿ_]*/;
const COMPARE = /^\s*(?:<=|>=|==|!=|=|<|>)\s*(?:-?\d+(?:[.,]\d+)?|[A-Za-zÀ-ÿ_][A-Za-z0-9À-ÿ_]*)/;

/** Réceptivité SFC Editor → contenu de `<condition>` SFCEdit (`/x` devient `<cpl>x</cpl>`). */
function toSfcCondition(src: string, notes: { edge: boolean; timer: boolean }): string {
  function operand(s: string, i: number): [string, number] {
    while (s[i] === ' ') i++;
    if (s[i] === '/' || s[i] === '!' || s[i] === '¬') { const [inner, j] = operand(s, i + 1); return [`<cpl>${inner}</cpl>`, j]; }
    if (s[i] === '(') {
      let depth = 0, j = i;
      for (; j < s.length; j++) { if (s[j] === '(') depth++; else if (s[j] === ')' && --depth === 0) break; }
      return [`<cpl>${body(s.slice(i + 1, j))}</cpl>`, j + 1];
    }
    const id = IDENT.exec(s.slice(i))?.[0];
    if (id) {
      let j = i + id.length;
      const c = COMPARE.exec(s.slice(j));
      if (c) j += c[0].length;
      return [esc(s.slice(i, j)), j];
    }
    return [esc(s[i] ?? ''), i + 1];
  }
  function body(s: string): string {
    let out = '', i = 0;
    while (i < s.length) {
      const rest = s.slice(i);
      const t = TIMER.exec(rest);
      if (t) { notes.timer = true; out += esc(t[0]); i += t[0].length; continue; }
      const c = s[i]!;
      if (c === '/' || c === '!' || c === '¬') { const [x, j] = operand(s, i); out += x; i = j; continue; }
      if (c === '↑' || c === '↓' || c === '^') notes.edge = true;
      const id = IDENT.exec(rest)?.[0];
      if (id) { out += esc(id); i += id.length; continue; }
      out += esc(c); i++;
    }
    return out;
  }
  return body(src);
}

function exportGrafcet(g: Grafcet, report: ReportEntry[], flags: { labels: boolean }): string {
  const ix = indexOf(g);
  const order = docOrder(g);
  const num = new Map(order.map((s, i) => [s.id, i + 1] as const));
  const notes = { edge: false, timer: false };
  let actionKinds = false, macroFlag = false;

  function stepXml(it: Extract<Node, { kind: 'step' }>): string {
    const attrs = `type="${it.initial ? 'initial' : 'normal'}" name="${/^\d+$/.test(it.num) ? 'X' + it.num : esc(it.num)}"` + (it.name ? ` x-label="${esc(it.name)}"` : '');
    if (it.name) flags.labels = true;
    if (it.expansion !== undefined) macroFlag = true;
    if (!it.actions.length) return `\t\t\t<step ${attrs} />`;
    const acts = it.actions.map((a) => {
      if (a.kind !== 'continue') actionKinds = true;
      const hasCond = a.kind === 'conditional' || a.kind === 'event';
      const type = hasCond ? 'conditional' : 'normal';
      const ext = a.kind === 'activation' || a.kind === 'deactivation' || a.kind === 'event' ? ` x-kind="${a.kind}"` : '';
      const cond = hasCond ? `<condition>${toSfcCondition(a.cond, notes)}</condition>` : '';
      return `\t\t\t\t<action type="${type}"${ext}>${cond}<text>${esc(a.label)}</text></action>`;
    });
    return `\t\t\t<step ${attrs}>\n${acts.join('\n')}\n\t\t\t</step>`;
  }
  const nodeXml = (it: Node): string => {
    if (it.kind === 'step') return stepXml(it);
    if (it.actions?.length) report.push(warn('rep_trans_action', { g: g.name, n: it.num }));
    return `\t\t\t<transition>\n\t\t\t\t<condition>${toSfcCondition(it.recept, notes)}</condition>\n\t\t\t</transition>`;
  };

  const body = order.map((s) => `\t\t<sequence id="${num.get(s.id)}">${s.items.length ? '\n' + s.items.map(nodeXml).join('\n') + '\n\t\t' : ''}</sequence>`);
  const hlinks = g.links.map((l) => `\t\t<hlink type="${l.kind} ${l.op}"${l.base ? ` seqid="${num.get(l.base)}"` : ''}>\n${l.nodes.map((n) => `\t\t\t<node seqid="${num.get(n)}" />`).join('\n')}\n\t\t</hlink>`);
  const jumpXml = g.jumps.map((j) => {
    const t = j.to ? ix.node.get(j.to) : undefined;
    if (!t) { report.push(err('rep_x_jump_target', { g: g.name })); return ''; }
    if (t.idx !== 0) report.push(err('rep_x_jump_mid', { g: g.name }));
    return `\t\t<jump seqid_from="${num.get(j.from)}" seqid_to="${num.get(t.seq.id)}" />`;
  }).filter(Boolean);
  if (notes.edge) report.push(warn('rep_x_edge', { g: g.name }));
  if (notes.timer) report.push(warn('rep_x_timer', { g: g.name }));
  if (actionKinds) report.push(warn('rep_x_actions', { g: g.name }));
  if (macroFlag) report.push(warn('rep_x_macro', { g: g.name }));

  const head = `\t<grafcet type="normal" owner="" name="${esc(g.name)}" comment="${esc(g.comment ?? '')}">`;
  return [head, ...body, ...hlinks, ...jumpXml, '\t</grafcet>'].join('\n');
}

/** Exporte un projet au format XML de SFCEdit (voir les limites dans le rapport de conversion). */
export function exportSfcEditXml(project: Project): ExportResult<string> {
  const report: ReportEntry[] = [];
  const flags = { labels: false };
  const grafcets = project.grafcets.map((g) => exportGrafcet(g, report, flags));
  if (flags.labels) report.push(info('rep_x_labels'));
  const output = `<?xml version="1.0" encoding="UTF-8"?>\n<project>\n${grafcets.join('\n')}\n</project>\n`;
  return { output, report: { entries: dedupe(report) } };
}
