import { checkGraph, docOrder, indexOf, nodesOf, numberTransitions, type Action, type Grafcet, type HLink, type Message, type Node, type Project, type Seq } from '@grafcet/core';
import { ImportError, type ExportResult, type ImportResult, type ReportEntry } from './contract';
import { elements, esc, local, parseXml, textOf, type XNode } from './xml';

/**
 * Adaptateur PLCopen XML (TC6 v2.01, `http://www.plcopen.org/xml/tc6_0201`) pour la partie SFC.
 *
 * Un GRAFCET devient un POU « program » dont le corps `SFC` est un graphe de connexions (`localId` / `refLocalId`) :
 *   étape → `step`, transition → `transition` (condition en ST), OU → `selectionDivergence` / `selectionConvergence`,
 *   ET → `simultaneousDivergence` / `simultaneousConvergence`, renvoi → `jumpStep`, actions → `actionBlock`.
 * Les variables utilisées sont déclarées dans l'interface du POU. Une étape testée dans une réceptivité devient `<étape>.X`.
 */
export const PLCOPEN_NS = 'http://www.plcopen.org/xml/tc6_0201';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

type Params = Record<string, string | number | Message>;
const entry = (level: ReportEntry['level'], key: string, params?: Params): ReportEntry => ({ level, message: { key, params } });
const info = (key: string, p?: Params) => entry('info', key, p);
const warn = (key: string, p?: Params) => entry('warning', key, p);
const err = (key: string, p?: Params) => entry('error', key, p);

export const looksLikePlcopenXml = (text: string): boolean => /plcopen\.org\/xml\/tc6/.test(text) && /<project[\s>]/.test(text);

/** Nom ST d'une étape : `X12` pour un identifiant numérique, sinon l'identifiant lui-même. */
const stepName = (num: string): string => (/^\d+$/.test(num) ? 'X' + num : num);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/* ------------------------------------------------------------------ export */

const TIMER = /^(?:t\d*\/(X\w+)\/(\d+(?:[.,]\d+)?)\s?(ms|s|min)|(\d+(?:[.,]\d+)?)\s?(ms|s|min)\/(X\w+))(?![\w])/i;
const WORD = /^[A-Za-zÀ-ÿ_][A-Za-z0-9À-ÿ_]*/;
const COMPARE = /^\s*(<=|>=|==|!=|=|<|>)\s*(-?\d+(?:[.,]\d+)?|[A-Za-zÀ-ÿ_][A-Za-z0-9À-ÿ_]*)/;

interface Notes { edge: boolean; timer: boolean; vars: Map<string, 'BOOL' | 'INT'> }

/** Réceptivité SFC Editor → expression ST. */
function toST(src: string, known: ReadonlySet<string>, notes: Notes): string {
  const stepOf = (w: string): string | null => {
    if (known.has(w)) return w;
    if (/^X./.test(w) && known.has(w.slice(1))) return w.slice(1);
    return /^X\d+$/.test(w) ? w.slice(1) : null;
  };
  const dur = (n: string, u: string) => `T#${n.replace(',', '.')}${u.toLowerCase() === 'min' ? 'm' : u.toLowerCase()}`;
  let out = '', i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpExecArray | null;
    if ((m = TIMER.exec(rest))) {
      notes.timer = true;
      const word = m[1] ?? m[6]!;
      const num = stepOf(word) ?? word.slice(1);
      out += `${stepName(num)}.T >= ${m[1] ? dur(m[2]!, m[3]!) : dur(m[4]!, m[5]!)}`;
      i += m[0].length; continue;
    }
    const c = src[i]!;
    if (c === '/' || c === '!' || c === '¬') { out += 'NOT '; i++; continue; }
    if (c === '.' || c === '·' || c === '*' || c === '&') { out += ' AND '; i++; continue; }
    if (c === '+') { out += ' OR '; i++; continue; }
    if (c === '↑' || c === '↓' || c === '^') { notes.edge = true; i++; continue; }
    if (/\s/.test(c)) { out += c; i++; continue; }
    if ((m = /^[01](?![\w])/.exec(rest))) { out += m[0] === '1' ? 'TRUE' : 'FALSE'; i++; continue; }
    if ((m = WORD.exec(rest))) {
      i += m[0].length;
      const s = stepOf(m[0]);
      if (s != null) { out += `${stepName(s)}.X`; continue; }
      const cmp = COMPARE.exec(src.slice(i));
      if (cmp) {
        i += cmp[0].length;
        const op = cmp[1] === '==' ? '=' : cmp[1] === '!=' ? '<>' : cmp[1]!;
        out += `${m[0]} ${op} ${cmp[2]!.replace(',', '.')}`;
        notes.vars.set(m[0], 'INT');
        if (/^[A-Za-zÀ-ÿ_]/.test(cmp[2]!)) notes.vars.set(cmp[2]!, 'INT');
      } else { out += m[0]; if (!notes.vars.has(m[0])) notes.vars.set(m[0], 'BOOL'); }
      continue;
    }
    out += c; i++;
  }
  return out.replace(/\s+/g, ' ').trim();
}

const COL = 200, ROW = 64;
type Pred = { id: number; fp?: string };

function exportGrafcet(g: Grafcet, known: ReadonlySet<string>, report: ReportEntry[], pouName: string): string {
  let next = 1;
  const nodes: string[] = [];
  const notes: Notes = { edge: false, timer: false, vars: new Map() };
  const outputs = new Set<string>();
  const ix = indexOf(g);
  const pos = (x: number, y: number) => `<position x="${Math.round(x)}" y="${Math.round(y)}"/>`;
  const cpin = (preds: Pred[]) => (preds.length ? `<connectionPointIn>${preds.map((p) => `<connection refLocalId="${p.id}"${p.fp != null ? ` formalParameter="${p.fp}"` : ''}/>`).join('')}</connectionPointIn>` : '');
  const st = (text: string) => `<ST><xhtml:p><![CDATA[${text.replace(/]]>/g, ']] >')}]]></xhtml:p></ST>`;

  // Identifiants PLCopen : un par élément, un par barre ; positions déduites de l'ordre de lecture du graphe.
  const plc = new Map<string, number>();
  for (const s of g.seqs) for (const it of s.items) plc.set(it.id, next++);
  for (const l of g.links) plc.set(l.id, next++);
  const top = new Map<string, number>();
  const topOf = (s: Seq, guard = 0): number => {
    if (top.has(s.id)) return top.get(s.id)!;
    let y = 0;
    const su = ix.startUse.get(s.id);
    if (su && guard < 50) {
      if (su.role === 'child') { const b = su.link.base ? ix.seq.get(su.link.base) : undefined; y = b ? topOf(b, guard + 1) + b.items.length * ROW + ROW : ROW; }
      else y = Math.max(0, ...su.link.nodes.map((n) => { const x = ix.seq.get(n); return x ? topOf(x, guard + 1) + x.items.length * ROW : 0; })) + ROW;
    }
    top.set(s.id, y);
    return y;
  };
  const order = docOrder(g);
  const col = new Map(order.map((s, i) => [s.id, i] as const));
  const x = (s: Seq) => (col.get(s.id) ?? 0) * COL;
  for (const l of g.links) if (!l.base) report.push(warn('rep_p_open_link', { g: g.name }));
  if (g.seqs.some((s) => s.items[0]?.kind === 'trans' && !ix.startUse.has(s.id))) report.push(warn('rep_p_source', { g: g.name }));
  if (g.seqs.some((s) => s.items.at(-1)?.kind === 'trans' && !ix.endUse.has(s.id))) report.push(warn('rep_p_sink', { g: g.name }));

  function actionBlock(step: Extract<Node, { kind: 'step' }>, stepId: number, ax: number, y: number): void {
    const acts = step.actions.map((a: Action, k) => {
      const id = next++;
      const rel = `<relPosition x="0" y="${k * 24}"/>`;
      const label = a.label.trim() || '_';
      if (!IDENT.test(label)) report.push(warn('rep_p_ident', { g: g.name, n: label }));
      else outputs.add(label);
      if (a.kind === 'conditional' || a.kind === 'event') {
        report.push(warn(a.kind === 'event' ? 'rep_p_event_action' : 'rep_p_cond_action', { g: g.name }));
        return `<action localId="${id}" qualifier="N">${rel}<inline>${st(`${label} := ${toST(a.cond || 'TRUE', known, notes)};`)}</inline></action>`;
      }
      const q = a.kind === 'activation' ? 'P1' : a.kind === 'deactivation' ? 'P0' : 'N';
      return `<action localId="${id}" qualifier="${q}">${rel}<reference name="${esc(label)}"/></action>`;
    });
    const id = next++;
    nodes.push(`<actionBlock localId="${id}">${pos(ax + COL / 2, y)}${cpin([{ id: stepId, fp: 'action' }])}${acts.join('')}</actionBlock>`);
  }

  /** Éléments précédant le début d'une séquence : sortie de la barre qui la précède, ou rien. */
  const predsOfStart = (s: Seq): Pred[] => {
    const su = ix.startUse.get(s.id);
    if (!su) return [];
    if (su.role === 'base') return [{ id: plc.get(su.link.id)! }];
    return su.link.base ? [{ id: plc.get(su.link.id)!, fp: String(su.link.nodes.indexOf(s.id)) }] : [];
  };

  for (const s of g.seqs) {
    let preds = predsOfStart(s);
    s.items.forEach((it, k) => {
      const y = topOf(s) + k * ROW, id = plc.get(it.id)!;
      if (it.kind === 'step') {
        if (it.expansion !== undefined) report.push(warn('rep_p_macro', { g: g.name }));
        nodes.push(`<step localId="${id}" name="${esc(stepName(it.num))}"${it.initial ? ' initialStep="true"' : ''}>${pos(x(s), y)}${cpin(preds)}<connectionPointOut formalParameter="sfc"/>${it.actions.length ? '<connectionPointOutAction formalParameter="action"/>' : ''}</step>`);
        if (it.actions.length) actionBlock(it, id, x(s), y);
        preds = [{ id, fp: 'sfc' }];
      } else {
        if (it.actions?.length) report.push(warn('rep_p_trans_action', { g: g.name, n: it.num }));
        let cond = '';
        if (it.recept.trim()) cond = `<condition><inline name="">${st(toST(it.recept, known, notes))}</inline></condition>`;
        else report.push(warn('rep_p_empty_cond', { g: g.name, n: it.num }));
        nodes.push(`<transition localId="${id}">${pos(x(s), y)}${cpin(preds)}<connectionPointOut/>${cond}</transition>`);
        preds = [{ id }];
      }
    });
  }
  const endOf = (s: Seq | undefined): Pred[] => { const l = s?.items.at(-1); if (!l) return []; return [{ id: plc.get(l.id)!, fp: l.kind === 'step' ? 'sfc' : undefined }]; };
  for (const l of g.links) {
    const or = l.op === 'or', id = plc.get(l.id)!;
    const base = l.base ? ix.seq.get(l.base) : undefined;
    const ys = (l.kind === 'div' ? (base ? topOf(base) + base.items.length * ROW : 0) : Math.max(0, ...l.nodes.map((n) => { const q = ix.seq.get(n); return q ? topOf(q) + q.items.length * ROW : 0; })));
    const cx = l.nodes.reduce((a, n) => a + (ix.seq.get(n) ? x(ix.seq.get(n)!) : 0), 0) / l.nodes.length;
    if (l.kind === 'div') {
      const tag = or ? 'selectionDivergence' : 'simultaneousDivergence';
      nodes.push(`<${tag} localId="${id}">${pos(cx, ys)}${cpin(endOf(base))}${l.nodes.map((_, k) => `<connectionPointOut formalParameter="${k}"/>`).join('')}</${tag}>`);
    } else {
      const tag = or ? 'selectionConvergence' : 'simultaneousConvergence';
      nodes.push(`<${tag} localId="${id}">${pos(cx, ys)}${l.nodes.map((n) => cpin(endOf(ix.seq.get(n)))).join('')}<connectionPointOut/></${tag}>`);
    }
  }
  for (const j of g.jumps) {
    const from = ix.seq.get(j.from), t = j.to ? ix.node.get(j.to) : undefined;
    if (!t) report.push(err('rep_p_jump_target', { g: g.name }));
    else if (t.item.kind !== 'step') report.push(err('rep_p_jump_trans', { g: g.name }));
    else if (from) nodes.push(`<jumpStep localId="${next++}" targetName="${esc(stepName(t.item.num))}">${pos(x(from), topOf(from) + from.items.length * ROW)}${cpin(endOf(from))}</jumpStep>`);
  }
  if (notes.edge) report.push(warn('rep_p_edge', { g: g.name }));
  if (notes.timer) report.push(info('rep_p_timer', { g: g.name }));

  const decl = (name: string) => `<variable name="${esc(name)}"><type><${notes.vars.get(name) ?? 'BOOL'}/></type></variable>`;
  const ins: string[] = [], outs: string[] = [], locals: string[] = [];
  for (const n of [...notes.vars.keys()].sort()) {
    if (!IDENT.test(n)) { report.push(warn('rep_p_ident', { g: g.name, n })); continue; }
    (outputs.has(n) ? locals : ins).push(decl(n));
  }
  for (const n of [...outputs].sort()) if (!notes.vars.has(n)) outs.push(`<variable name="${esc(n)}"><type><BOOL/></type></variable>`);
  const group = (tag: string, l: string[]) => (l.length ? `<${tag}>${l.join('')}</${tag}>` : '');
  const iface = group('inputVars', ins) + group('outputVars', outs) + group('localVars', locals);
  const doc = g.comment ? `<documentation><xhtml:p>${esc(g.comment)}</xhtml:p></documentation>` : '';
  return `<pou name="${esc(pouName)}" pouType="program">${iface ? `<interface>${iface}</interface>` : ''}<body><SFC>${nodes.join('')}</SFC></body>${doc}</pou>`;
}

export interface PlcopenExportOptions {
  /** Date d'écriture (par défaut : maintenant). Fournir une date fixe pour une sortie déterministe. */
  now?: Date;
}

/** Exporte un projet en PLCopen XML (TC6 v2.01). */
export function exportPlcopenXml(project: Project, opts: PlcopenExportOptions = {}): ExportResult<string> {
  const report: ReportEntry[] = [];
  const known = new Set<string>();
  for (const g of project.grafcets) for (const it of nodesOf(g)) if (it.kind === 'step') known.add(it.num);
  const used = new Set<string>();
  const pous = project.grafcets.map((g, i) => {
    let name = g.name.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || `Grafcet${i + 1}`;
    if (/^\d/.test(name)) name = 'G' + name;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${name.replace(/_\d+$/, '')}_${k}`;
    used.add(name.toLowerCase());
    if (name !== g.name) report.push(info('rep_p_pouname', { g: g.name, n: name }));
    return exportGrafcet(g, known, report, name);
  });
  const date = (opts.now ?? new Date()).toISOString().slice(0, 19);
  const scaling = '<scaling x="1" y="1"/>';
  const output = `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="${PLCOPEN_NS}" xmlns:xhtml="${XHTML_NS}">\n`
    + `<fileHeader companyName="" productName="SFC Editor" productVersion="0.1.0" creationDateTime="${date}"/>\n`
    + `<contentHeader name="${esc(project.name || 'projet')}"><coordinateInfo><fbd>${scaling}</fbd><ld>${scaling}</ld><sfc>${scaling}</sfc></coordinateInfo></contentHeader>\n`
    + `<types><dataTypes/><pous>\n${pous.join('\n')}\n</pous></types>\n<instances><configurations/></instances>\n</project>\n`;
  return { output, report: { entries: dedupe(report) } };
}

function dedupe(entries: ReportEntry[]): ReportEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => { const k = JSON.stringify(e); if (seen.has(k)) return false; seen.add(k); return true; });
}

/* ------------------------------------------------------------------ import */

/** Expression ST d'une condition → réceptivité SFC Editor. */
function fromST(src: string): { text: string; lossy: boolean } {
  let lossy = false;
  const text = src
    .replace(/\(\*[\s\S]*?\*\)/g, '')
    .replace(/\b([A-Za-z_]\w*)\.X\b/g, '$1')
    .replace(/\b([A-Za-z_]\w*)\.T\s*>=\s*T#(\d+(?:\.\d+)?)(ms|s|m)\b/gi, (_m, s: string, n: string, u: string) => `t1/${s}/${n}${u.toLowerCase() === 'm' ? 'min' : u.toLowerCase()}`)
    .replace(/\bAND\b|&/gi, '.').replace(/\bOR\b/gi, '+').replace(/\bNOT\s*/gi, '/')
    .replace(/\bTRUE\b/gi, '1').replace(/\bFALSE\b/gi, '0').replace(/<>/g, '!=')
    .replace(/\bXOR\b/gi, () => { lossy = true; return '+'; })
    .replace(/\s+/g, ' ').replace(/\s*([.+])\s*/g, '$1').trim();
  return { text, lossy };
}

interface PNode { id: string; tag: string; el: XNode; ins: { ref: string; fp?: string }[] }

function importPou(P: Project, pou: XNode, report: ReportEntry[], index: number): Grafcet | null {
  const g: Grafcet = { id: 'g' + P.gcount++, name: pou.attrs.name || `Grafcet ${index + 1}`, nextStep: 0, nextTrans: 1, seqs: [], links: [], jumps: [] };
  const sfc = elements(elements(pou, 'body')[0] ?? { tag: '', attrs: {}, children: [] }, 'SFC')[0];
  if (!sfc) return null;
  const doc = elements(pou, 'documentation')[0];
  if (doc) g.comment = textOf(doc).trim();

  const nodes = new Map<string, PNode>();
  const order: string[] = [];
  const actionBlocks: PNode[] = [];
  for (const el of elements(sfc)) {
    const tag = local(el.tag), id = el.attrs.localId;
    if (!id) continue;
    if (!['step', 'transition', 'selectionDivergence', 'selectionConvergence', 'simultaneousDivergence', 'simultaneousConvergence', 'jumpStep', 'actionBlock'].includes(tag)) {
      if (['macroStep', 'continuation', 'connector', 'inVariable', 'outVariable', 'block', 'comment', 'error'].includes(tag)) report.push(warn('rep_unknown_tag', { tag }));
      continue;
    }
    const ins: PNode['ins'] = [];
    for (const cp of elements(el, 'connectionPointIn')) for (const c of elements(cp, 'connection')) if (c.attrs.refLocalId) ins.push({ ref: c.attrs.refLocalId, fp: c.attrs.formalParameter });
    const n: PNode = { id, tag, el, ins };
    nodes.set(id, n);
    if (tag === 'actionBlock') actionBlocks.push(n); else order.push(id);
  }
  /** Successeurs d'un nœud, dans l'ordre des broches de sortie puis du document. */
  const succ = new Map<string, { id: string; fp?: string }[]>();
  for (const id of order) for (const c of nodes.get(id)!.ins) { const l = succ.get(c.ref) ?? []; l.push({ id, fp: c.fp }); succ.set(c.ref, l); }
  for (const [, l] of succ) l.sort((a, b) => (Number(a.fp) || 0) - (Number(b.fp) || 0));

  const nid = (p = 'n') => p + P.counter++;
  const stepByName = new Map<string, string>();
  const itemOf = new Map<string, Node>();
  const jumpsToFix: { jump: { id: string; from: string; to: string | null }; name: string }[] = [];
  const stepNum = (name: string) => { const m = /^X(\d+)$/i.exec(name); return m ? m[1]! : name; };

  // actions : rattachées à l'étape référencée
  const actionsOf = new Map<string, Action[]>();
  for (const ab of actionBlocks) {
    const list: Action[] = [];
    for (const a of elements(ab.el, 'action')) {
      const q = a.attrs.qualifier ?? 'N';
      const ref = elements(a, 'reference')[0], inl = elements(a, 'inline')[0];
      let label = ref?.attrs.name ?? '', cond = '', kind: Action['kind'] = q === 'P1' ? 'activation' : q === 'P0' ? 'deactivation' : 'continue';
      if (!['N', 'P1', 'P0'].includes(q)) report.push(warn('rep_p_qualifier', { g: g.name, q }));
      if (inl) {
        const m = /^\s*([A-Za-z_]\w*)\s*:=\s*([\s\S]*?);?\s*$/.exec(textOf(inl));
        if (m) { label = m[1]!; cond = fromST(m[2]!).text; kind = 'conditional'; } else { label = textOf(inl).trim(); report.push(warn('rep_p_inline_action', { g: g.name })); }
      }
      list.push({ kind, label, cond });
    }
    for (const c of ab.ins) { const l = actionsOf.get(c.ref) ?? []; l.push(...list); actionsOf.set(c.ref, l); }
  }

  const visited = new Set<string>();
  /** Convergences PLCopen rencontrées : séquences qui y arrivent, séquence aval une fois construite. */
  const convs = new Map<string, { nodes: string[]; base: string | null; op: 'or' | 'and' }>();
  const isDiv = (t: string) => t === 'selectionDivergence' || t === 'simultaneousDivergence';
  const isConv = (t: string) => t === 'selectionConvergence' || t === 'simultaneousConvergence';

  /** Construit la séquence qui commence en `start` (créée, ajoutée au GRAFCET) ; renvoie son id. */
  function build(start: string): string {
    const seq: Seq = { id: nid('q'), items: [] };
    g.seqs.push(seq);
    let cur: string | undefined = start;
    while (cur) {
      const n = nodes.get(cur);
      if (!n) break;
      if (isConv(n.tag)) {
        let c = convs.get(cur);
        if (!c) { c = { nodes: [], base: null, op: n.tag === 'selectionConvergence' ? 'or' : 'and' }; convs.set(cur, c); }
        c.nodes.push(seq.id);
        if (!visited.has(cur)) { visited.add(cur); const nx = succ.get(cur)?.[0]?.id; if (nx) c.base = build(nx); }
        break;
      }
      if (visited.has(cur) && !isDiv(n.tag)) {
        const target = itemOf.get(cur);
        if (target && seq.items.length) g.jumps.push({ id: nid('j'), from: seq.id, to: target.id });
        break;
      }
      visited.add(cur);
      if (n.tag === 'step') {
        const name = n.el.attrs.name ?? '';
        const step: Extract<Node, { kind: 'step' }> = { id: nid(), kind: 'step', num: stepNum(name), name: '', initial: n.el.attrs.initialStep === 'true', actions: actionsOf.get(cur) ?? [] };
        seq.items.push(step); itemOf.set(cur, step); stepByName.set(name, step.id);
      } else if (n.tag === 'transition') {
        const cond = elements(n.el, 'condition')[0];
        let recept = '';
        if (cond) {
          const ref = elements(cond, 'reference')[0], inl = elements(cond, 'inline')[0];
          if (ref) recept = ref.attrs.name ?? '';
          else if (inl) { const r = fromST(textOf(inl)); recept = r.text; if (r.lossy) report.push(warn('rep_p_xor', { g: g.name })); if (/[:;]/.test(recept) || /\b(IF|THEN)\b/.test(recept)) report.push(warn('rep_p_cond_st', { g: g.name })); }
          else report.push(warn('rep_p_cond_graphic', { g: g.name }));
          if (cond.attrs.negated === 'true') recept = '/(' + recept + ')';
        }
        const t: Extract<Node, { kind: 'trans' }> = { id: nid(), kind: 'trans', num: 0, recept };
        seq.items.push(t); itemOf.set(cur, t);
      } else if (n.tag === 'jumpStep') {
        const j = { id: nid('j'), from: seq.id, to: null as string | null };
        jumpsToFix.push({ jump: j, name: n.el.attrs.targetName ?? '' });
        g.jumps.push(j);
        break;
      } else if (isDiv(n.tag)) {
        const kids = (succ.get(cur) ?? []).map((s) => build(s.id));
        if (kids.length >= 2) g.links.push({ id: nid('l'), kind: 'div', op: n.tag === 'selectionDivergence' ? 'or' : 'and', base: seq.id, nodes: kids });
        break;
      }
      const nx: { id: string; fp?: string }[] = succ.get(cur) ?? [];
      if (nx.length > 1) report.push(warn('rep_p_implicit_div', { g: g.name }));
      cur = nx[0]?.id;
    }
    return seq.id;
  }

  const starts = order.filter((id) => !isConv(nodes.get(id)!.tag) && !nodes.get(id)!.ins.length && (nodes.get(id)!.tag === 'step' || nodes.get(id)!.tag === 'transition'));
  const initials = order.filter((id) => nodes.get(id)!.tag === 'step' && nodes.get(id)!.el.attrs.initialStep === 'true');
  if (!initials.length) report.push(warn('rep_p_no_initial', { g: g.name }));
  const firstStarts = [...new Set([...initials, ...starts])];
  if (!firstStarts.length) return null;
  for (const s of firstStarts) if (!visited.has(s)) build(s);
  for (const [, c] of convs) {
    if (c.nodes.length >= 2) g.links.push({ id: nid('l'), kind: 'conv', op: c.op, base: c.base, nodes: c.nodes });
    else if (c.base) report.push(warn('rep_p_conv_mixed', { g: g.name }));
  }
  for (const id of order) if (!visited.has(id)) { report.push(warn('rep_p_orphan', { g: g.name })); break; }
  for (const { jump, name } of jumpsToFix) {
    const t = stepByName.get(name);
    if (t) jump.to = t; else report.push(err('rep_jump_target', { g: g.name }));
  }
  g.seqs = g.seqs.filter((s) => s.items.length || g.links.some((l) => l.base === s.id || l.nodes.includes(s.id)));
  const probeCheck = checkGraph(g);
  if (probeCheck) report.push(err('rep_structure', { g: g.name, e: { key: probeCheck } }));
  numberTransitions(g);
  const maxStep = Math.max(-1, ...nodesOf(g).filter((it) => it.kind === 'step' && /^\d+$/.test(it.num)).map((it) => +it.num));
  g.nextStep = Math.max(g.nextStep, maxStep + 1);
  return g;
}

/** Importe un fichier PLCopen XML (TC6 v2.01) : seuls les POU dont le corps est un SFC sont lus. */
export function importPlcopenXml(text: string, opts: { projectName?: string } = {}): ImportResult<Project> {
  let root: XNode;
  try { root = parseXml(text); } catch (e) { throw new ImportError({ key: 'imp_plcopen', params: { m: String((e as Error).message) } }); }
  if (local(root.tag) !== 'project') throw new ImportError({ key: 'imp_plcopen_root' });
  const report: ReportEntry[] = [];
  const ch = elements(root, 'contentHeader')[0];
  const P: Project = { name: opts.projectName || ch?.attrs.name || 'projet', counter: 1, gcount: 1, grafcets: [] };
  const pous = elements(elements(elements(root, 'types')[0] ?? root, 'pous')[0] ?? root, 'pou');
  pous.forEach((pou, i) => {
    const g = importPou(P, pou, report, i);
    if (g) P.grafcets.push(g); else report.push(info('rep_p_skip_pou', { n: pou.attrs.name ?? '?' }));
  });
  if (!P.grafcets.length) throw new ImportError({ key: 'imp_plcopen_nosfc' });
  return { model: P, report: { entries: dedupe(report) } };
}
