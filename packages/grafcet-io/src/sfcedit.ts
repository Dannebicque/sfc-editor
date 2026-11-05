import { checkSeq, walkAll, type Action, type Block, type Grafcet, type Item, type Message, type Project } from '@grafcet/core';
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

interface SeqData { id: string; items: Item[] }
interface HLink { kind: 'div' | 'conv'; op: 'and' | 'or'; seqid: string; nodes: string[] }

function importGrafcet(P: Project, gx: XNode, report: ReportEntry[], index: number): Grafcet {
  const nameAttr = gx.attrs.name || `Grafcet ${index + 1}`;
  const g: Grafcet = { id: 'g' + P.gcount++, name: nameAttr, nextStep: 0, nextTrans: 1, items: [] };
  if (gx.attrs.comment) g.comment = gx.attrs.comment;
  if (gx.attrs.type && gx.attrs.type !== 'normal') report.push(warn('rep_grafcet_type', { g: g.name, type: gx.attrs.type }));
  if (gx.attrs.owner) report.push(info('rep_owner', { g: g.name, owner: gx.attrs.owner }));

  const seqs = new Map<string, SeqData>();
  const pendingNumbers: Extract<Item, { kind: 'step' }>[] = [];
  const nid = () => 'n' + P.counter++;

  for (const sx of elements(gx, 'sequence')) {
    const seq: SeqData = { id: sx.attrs.id ?? String(seqs.size + 1), items: [] };
    for (const c of elements(sx)) {
      if (c.tag === 'step') {
        const rawName = (c.attrs.name ?? '').trim();
        const m = /^X(\d+)$/i.exec(rawName);
        const type = c.attrs.type ?? 'normal';
        if (type !== 'normal' && type !== 'initial') report.push(warn('rep_step_type', { g: g.name, type, name: c.attrs.name ?? '?' }));
        const step: Extract<Item, { kind: 'step' }> = {
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
    seqs.set(seq.id, seq);
  }

  const links: HLink[] = [];
  for (const h of elements(gx, 'hlink')) {
    const m = /^(div|conv)\s+(and|or)$/i.exec((h.attrs.type ?? '').trim());
    if (!m) { report.push(warn('rep_unknown_tag', { tag: `hlink ${h.attrs.type ?? ''}`.trim() })); continue; }
    links.push({ kind: m[1]!.toLowerCase() as 'div' | 'conv', op: m[2]!.toLowerCase() as 'and' | 'or', seqid: h.attrs.seqid ?? '', nodes: elements(h, 'node').map((n) => n.attrs.seqid ?? '') });
  }
  const jumps = new Map<string, string>();
  for (const j of elements(gx, 'jump')) jumps.set(j.attrs.seqid_from ?? '', j.attrs.seqid_to ?? '');
  for (const t of gx.children) if (typeof t !== 'string' && !['sequence', 'hlink', 'jump'].includes(t.tag)) report.push(warn('rep_unknown_tag', { tag: t.tag }));

  const divByParent = new Map(links.filter((l) => l.kind === 'div').map((l) => [l.seqid, l] as const));
  const convs = links.filter((l) => l.kind === 'conv');
  const used = new Set<HLink>();
  const building = new Set<string>();
  const built = new Set<string>();

  interface Built { items: Item[]; end: string; endsWithJump: boolean }
  function build(id: string): Built {
    const s = seqs.get(id);
    if (!s || building.has(id)) { report.push(err('rep_cycle', { g: g.name })); return { items: [], end: id, endsWithJump: true }; }
    building.add(id); built.add(id);
    const items = [...s.items];
    let end = id, endsWithJump = false;
    const div = divByParent.get(id);
    if (div) {
      const block: Block = { id: nid(), kind: div.op, branches: [] };
      const ends: { seq: string; jumps: boolean }[] = [];
      for (const node of div.nodes) {
        const b = build(node);
        block.branches.push(b.items);
        ends.push({ seq: b.end, jumps: b.endsWithJump });
      }
      items.push(block);
      const live = ends.filter((e) => !e.jumps).map((e) => e.seq);
      const conv = convs.find((c) => !used.has(c) && c.nodes.length === live.length && live.every((x) => c.nodes.includes(x)));
      if (conv) {
        used.add(conv);
        if (conv.op !== div.op) report.push(warn('rep_conv_kind', { g: g.name }));
        const cont = build(conv.seqid);
        items.push(...cont.items);
        end = cont.end; endsWithJump = cont.endsWithJump;
      } else if (live.length) report.push(warn('rep_conv_missing', { g: g.name }));
      else endsWithJump = true;
    } else {
      const to = jumps.get(id);
      if (to !== undefined) {
        const first = seqs.get(to)?.items[0];
        if (!first) report.push(err('rep_jump_target', { g: g.name }));
        items.push({ id: nid(), kind: 'jump', target: first ? first.id : null });
        endsWithJump = true;
      }
    }
    building.delete(id);
    return { items, end, endsWithJump };
  }

  const nodesOfDiv = new Set(links.filter((l) => l.kind === 'div').flatMap((l) => l.nodes));
  const contSeqs = new Set(convs.map((l) => l.seqid));
  const roots = [...seqs.keys()].filter((id) => !nodesOfDiv.has(id) && !contSeqs.has(id));
  if (roots.length) {
    g.items = build(roots[0]!).items;
    for (const id of seqs.keys()) if (!built.has(id)) report.push(warn('rep_orphan_seq', { g: g.name, n: id }));
  } else if (seqs.size) report.push(err('rep_cycle', { g: g.name }));

  let tn = 1, maxStep = -1;
  walkAll(g.items, (it) => { if (it.kind === 'trans') it.num = tn++; else if (it.kind === 'step' && /^\d+$/.test(it.num)) maxStep = Math.max(maxStep, +it.num); });
  for (const s of pendingNumbers) s.num = String(++maxStep);
  g.nextTrans = tn;
  g.nextStep = maxStep + 1;
  const e = g.items.length ? checkSeq(g.items, 'root') : 'chk_empty';
  if (e) report.push(err('rep_structure', { g: g.name, e: { key: e } }));
  return g;
}

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

interface OutSeq { id: number; nodes: string[] }

function exportGrafcet(g: Grafcet, report: ReportEntry[], flags: { labels: boolean }): string {
  const seqs: OutSeq[] = [];
  const hlinks: string[] = [];
  const jumps: { from: number; target: string | null }[] = [];
  const placement = new Map<string, { seq: number; idx: number }>();
  const notes = { edge: false, timer: false };
  let actionKinds = false, macroFlag = false;
  const newSeq = (): OutSeq => { const s = { id: seqs.length + 1, nodes: [] as string[] }; seqs.push(s); return s; };

  function stepXml(it: Extract<Item, { kind: 'step' }>): string {
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

  interface Chain { first: number; end: number; endsWithJump: boolean }
  function emit(items: Item[]): Chain {
    let cur: OutSeq = newSeq();
    const first = cur.id;
    let endsWithJump = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (it.kind === 'step' || it.kind === 'trans') {
        placement.set(it.id, { seq: cur.id, idx: cur.nodes.length });
        cur.nodes.push(it.kind === 'step' ? stepXml(it)
          : `\t\t\t<transition>\n\t\t\t\t<condition>${toSfcCondition(it.recept, notes)}</condition>\n\t\t\t</transition>`);
      } else if (it.kind === 'jump') {
        jumps.push({ from: cur.id, target: it.target });
        endsWithJump = true;
      } else {
        const parent = cur;
        const results = it.branches.map((b) => emit(b));
        hlinks.push(`\t\t<hlink type="div ${it.kind}" seqid="${parent.id}">\n${results.map((r) => `\t\t\t<node seqid="${r.first}" />`).join('\n')}\n\t\t</hlink>`);
        const live = results.filter((r) => !r.endsWithJump).map((r) => r.end);
        if (i + 1 < items.length && live.length) {
          cur = newSeq();
          hlinks.push(`\t\t<hlink type="conv ${it.kind}" seqid="${cur.id}">\n${live.map((s) => `\t\t\t<node seqid="${s}" />`).join('\n')}\n\t\t</hlink>`);
        } else { endsWithJump = !live.length; if (live.length) cur = seqs[live[0]! - 1]!; }
      }
    }
    return { first, end: cur.id, endsWithJump };
  }
  emit(g.items);

  const jumpXml = jumps.map((j) => {
    const p = j.target ? placement.get(j.target) : undefined;
    if (!p) { report.push(err('rep_x_jump_target', { g: g.name })); return ''; }
    if (p.idx !== 0) report.push(err('rep_x_jump_mid', { g: g.name }));
    return `\t\t<jump seqid_from="${j.from}" seqid_to="${p.seq}" />`;
  }).filter(Boolean);
  if (notes.edge) report.push(warn('rep_x_edge', { g: g.name }));
  if (notes.timer) report.push(warn('rep_x_timer', { g: g.name }));
  if (actionKinds) report.push(warn('rep_x_actions', { g: g.name }));
  if (macroFlag) report.push(warn('rep_x_macro', { g: g.name }));

  const head = `\t<grafcet type="normal" owner="" name="${esc(g.name)}" comment="${esc(g.comment ?? '')}">`;
  const body = seqs.map((s) => `\t\t<sequence id="${s.id}">\n${s.nodes.join('\n')}\n\t\t</sequence>`);
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
