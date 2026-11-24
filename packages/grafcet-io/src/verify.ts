import { flatten, type Grafcet, type Node, type Project } from '@grafcet/core';
import { convertCondition, importAction } from './sfcedit';
import { elements, parseXml, textOf, type XNode } from './xml';

/**
 * Contrôle d'un import SFCEdit : compare le réseau étapes/transitions lu directement dans le XML (lecture indépendante
 * de l'importeur : séquences vides = fils, contractés) avec celui du modèle importé (`flatten`).
 * Positions et mise en page n'interviennent pas : on compare la topologie, les réceptivités et les actions.
 *
 * Chaque transition donne une signature « {étapes amont} --réceptivité [actions]--> {étapes aval} » ; chaque étape, une
 * fiche « initiale, tâche, actions ». Deux GRAFCET sont jugés équivalents quand ces deux multiensembles sont égaux.
 */

/* ---------------------------------------------------------------- équations */

type Tok = string; // '(' ')' '+' '.' '¬' ou atome
const TIMER_RE = /^(?:t\d*\/X\w+\/\d+(?:[.,]\d+)?\s?(?:ms|s|min)|\d+(?:[.,]\d+)?\s?(?:ms|s|min)\/X\w+)(?![\w])/i;
const CMP_RE = /^\s*(?:<=|>=|==|!=|=|<|>)\s*(?:-?\d+(?:[.,]\d+)?|[A-Za-zÀ-ÿ_][A-Za-z0-9À-ÿ_]*)/;

/** Découpe un texte en jetons ; `edge` : front en attente (↑ ou ↓) à coller à l'atome suivant. */
function tokenize(src: string, edge = ''): Tok[] {
  const out: Tok[] = [];
  let i = 0, pend = edge;
  const atom = (a: string): void => { out.push(pend + a.replace(/\s+/g, '')); pend = ''; };
  while (i < src.length) {
    const c = src[i]!, rest = src.slice(i);
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')' || c === '+') { out.push(c); i++; continue; }
    if (c === '.' || c === '·' || c === '*' || c === '&') { out.push('.'); i++; continue; }
    if (c === '/' || c === '!' || c === '¬') { out.push('¬'); i++; continue; }
    if (c === '↑' || c === '^') { pend = '↑'; i++; continue; }
    if (c === '↓') { pend = '↓'; i++; continue; }
    if (c === '[') { const j = rest.indexOf(']'); const k = j < 0 ? rest.length : j + 1; atom(rest.slice(0, k)); i += k; continue; }
    const t = TIMER_RE.exec(rest);
    if (t) { atom(t[0]); i += t[0].length; continue; }
    const id = /^(?:[A-Za-zÀ-ÿ_][A-Za-z0-9À-ÿ_]*|\d+)/.exec(rest)?.[0];
    if (id) { i += id.length; const cm = CMP_RE.exec(src.slice(i)); atom(cm ? id + cm[0] : id); if (cm) i += cm[0].length; continue; }
    atom(c); i++;
  }
  return out;
}

/** Jetons d'une condition SFCEdit : `<cpl>` devient « NON ( … ) » (barre sur tout son contenu), `<re/>` `<fe/>` des fronts. */
function xmlTokens(n: XNode): Tok[] {
  const out: Tok[] = [];
  let edge = '';
  for (const c of n.children) {
    if (typeof c === 'string') { const t = tokenize(c, edge); if (t.length) edge = ''; out.push(...t); }
    else if (c.tag === 'cpl') out.push('¬', '(', ...xmlTokens(c), ')');
    else if (c.tag === 're') edge = '↑';
    else if (c.tag === 'fe') edge = '↓';
    else out.push(...xmlTokens(c));
  }
  return out;
}

type Fn = (env: Map<string, boolean>) => boolean;
type Expr = { atoms: Set<string>; ev: (env: Map<string, boolean>) => boolean };
function parseTokens(t: Tok[]): Expr | null {
  const atoms = new Set<string>();
  let i = 0;
  const or = (): Fn | null => {
    let a = and(); if (!a) return null;
    while (t[i] === '+') { i++; const b = and(); if (!b) return null; const x: Fn = a; a = (e) => x(e) || b(e); }
    return a;
  };
  const and = (): Fn | null => {
    let a = not(); if (!a) return null;
    while (t[i] === '.') { i++; const b = not(); if (!b) return null; const x: Fn = a; a = (e) => x(e) && b(e); }
    return a;
  };
  const not = (): Fn | null => {
    if (t[i] === '¬') { i++; const a = not(); return a && ((e) => !a(e)); }
    if (t[i] === '(') { i++; const a = or(); if (!a || t[i] !== ')') return null; i++; return a; }
    const a = t[i];
    if (a === undefined || a === ')' || a === '+' || a === '.') return null;
    i++;
    if (a === '0') return () => false;
    if (a === '1') return () => true;
    atoms.add(a);
    return (e) => e.get(a) ?? false;
  };
  const f = or();
  return f && i === t.length ? { atoms, ev: f } : null;
}

/** Vrai si les deux listes de jetons définissent la même fonction booléenne (table de vérité, échantillon au-delà de 16 atomes). */
export function sameEquation(a: Tok[], b: Tok[]): boolean {
  const ea = parseTokens(a), eb = parseTokens(b);
  if (!ea || !eb) return false;
  const atoms = [...new Set([...ea.atoms, ...eb.atoms])];
  const n = atoms.length, total = n <= 16 ? 2 ** n : 65536;
  for (let k = 0; k < total; k++) {
    const bits = n <= 16 ? k : Math.floor(Math.random() * 2 ** 30) * 2 ** 10 + k;
    const env = new Map(atoms.map((x, j) => [x, Math.floor(bits / 2 ** (j % 40)) % 2 === 1] as const));
    if (ea.ev(env) !== eb.ev(env)) return false;
  }
  return true;
}

export interface EquationCheck { grafcet: string; xml: string; imported: string }

const countCpl = (n: XNode): number => n.children.reduce<number>((k, c) => (typeof c === 'string' ? k : k + (c.tag === 'cpl' ? 1 : 0) + countCpl(c)), 0);
const flat = (s: string): string => s.replace(/[\s/()]/g, '');

/** Toutes les conditions du XML dont le texte importé n'est pas la même équation booléenne. */
export function checkEquations(xml: string): { checked: number; bad: EquationCheck[] } {
  const root = parseXml(xml);
  const bad: EquationCheck[] = [];
  let checked = 0;
  const walk = (n: XNode, g: string): void => {
    for (const c of n.children) {
      if (typeof c === 'string') continue;
      if (c.tag === 'condition') {
        checked++;
        const imported = convertCondition(c, []);
        if (!sameEquation(xmlTokens(c), tokenize(imported))) bad.push({ grafcet: g, xml: xmlTokens(c).join(' '), imported });
      } else if (c.tag === 'action') {
        // Libellé d'action : mêmes caractères (hors barres et parenthèses) et autant de négations que de <cpl> dans le XML.
        const t = elements(c, 'text')[0];
        if (t) {
          checked++;
          const imported = importAction(c, '', []).label;
          const nots = (imported.match(/\//g) ?? []).length;
          if (flat(textOf(t)) !== flat(imported) || countCpl(t) !== nots) bad.push({ grafcet: g, xml: `${textOf(t).trim()} (${countCpl(t)} négation(s))`, imported });
        }
        walk(c, g);
      } else walk(c, g);
    }
  };
  for (const gx of elements(root, 'grafcet')) walk(gx, gx.attrs.name ?? '');
  return { checked, bad };
}

export interface GrafcetCheck {
  grafcet: string;
  ok: boolean;
  steps: number;
  transitions: number;
  /** Éléments présents dans le XML mais pas dans le modèle importé (`-`) ou l'inverse (`+`). */
  diffs: string[];
}

const stepLabel = (num: string): string => (/^\d/.test(num) ? 'X' + num : num);
const list = (xs: string[]): string => '{' + [...xs].sort().join(', ') + '}';
const actKey = (a: { kind: string; label: string; cond: string }): string => `${a.kind}:${a.label}${a.cond ? '?' + a.cond : ''}`;

interface Net {
  /** étape → fiche */
  steps: Map<string, string>;
  /** signatures de transitions (multiensemble) */
  trans: string[];
}

/** Réseau lu dans un `<grafcet>` du XML, en contractant les séquences vides. */
function referenceNet(gx: XNode): { net: Net; notes: string[] } {
  const notes: string[] = [];
  const kind = new Map<string, 'step' | 'trans' | 'wire'>();
  const label = new Map<string, string>();
  const steps = new Map<string, string>();
  const tinfo = new Map<string, string>();
  const first = new Map<string, string>(), last = new Map<string, string>();
  const arcs = new Set<string>();
  const arc = (a: string, b: string): void => { arcs.add(a + '\u0000' + b); };

  for (const sx of elements(gx, 'sequence')) {
    const sid = sx.attrs.id ?? '';
    const items = elements(sx).filter((c) => c.tag === 'step' || c.tag === 'transition');
    if (!items.length) { const w = `${sid}.w`; kind.set(w, 'wire'); first.set(sid, w); last.set(sid, w); continue; }
    let prev = '';
    items.forEach((c, i) => {
      const id = `${sid}.${i}`;
      if (c.tag === 'step') {
        const name = (c.attrs.name ?? '').trim() || `?${id}`;
        kind.set(id, 'step'); label.set(id, name);
        const type = c.attrs.type ?? 'normal';
        const acts = elements(c, 'action').map((a) => actKey(importAction(a, '', [])));
        const key = `${type === 'initial' ? 'initiale ' : ''}${type === 'task' || c.attrs['x-task'] === '1' ? 'tâche ' : ''}actions[${acts.sort().join(' | ')}]`;
        if (steps.has(name)) notes.push(`étape « ${name} » définie plusieurs fois`);
        steps.set(name, key);
      } else {
        kind.set(id, 'trans');
        const cond = elements(c, 'condition')[0];
        const acts = elements(c, 'action').map((a) => actKey({ ...importAction(a, '', []), kind: 'event' }));
        tinfo.set(id, `${cond ? convertCondition(cond, []) : ''}${acts.length ? ' [' + acts.sort().join(' | ') + ']' : ''}`);
      }
      if (prev) arc(prev, id);
      prev = id;
    });
    first.set(sid, `${sid}.0`); last.set(sid, prev);
  }
  for (const h of elements(gx, 'hlink')) {
    const m = /^(div|conv)\s/i.exec((h.attrs.type ?? '').trim());
    const base = h.attrs.seqid;
    for (const n of elements(h, 'node')) {
      const id = n.attrs.seqid ?? '';
      if (!base || !first.has(base) || !first.has(id)) continue;
      if (m?.[1]?.toLowerCase() === 'div') arc(last.get(base)!, first.get(id)!); else arc(last.get(id)!, first.get(base)!);
    }
  }
  for (const j of elements(gx, 'jump')) {
    const a = last.get(j.attrs.seqid_from ?? ''), b = first.get(j.attrs.seqid_to ?? '');
    if (a && b) arc(a, b); else notes.push(`renvoi ${j.attrs.seqid_from} → ${j.attrs.seqid_to} vers une séquence inconnue`);
  }

  // Contraction des fils (séquences vides) : chaque prédécesseur est relié à chaque successeur.
  let edges = [...arcs].map((k) => k.split('\u0000') as [string, string]);
  for (const w of [...kind].filter(([, k]) => k === 'wire').map(([id]) => id)) {
    const ins = edges.filter(([, b]) => b === w).map(([a]) => a).filter((a) => a !== w);
    const outs = edges.filter(([a]) => a === w).map(([, b]) => b).filter((b) => b !== w);
    edges = edges.filter(([a, b]) => a !== w && b !== w);
    for (const a of ins) for (const b of outs) edges.push([a, b]);
  }
  const seen = new Set<string>();
  edges = edges.filter(([a, b]) => { const k = a + '\u0000' + b; if (seen.has(k)) return false; seen.add(k); return true; });

  const trans: string[] = [];
  for (const [id, k] of kind) {
    if (k !== 'trans') continue;
    const ins = edges.filter(([, b]) => b === id).map(([a]) => (kind.get(a) === 'step' ? label.get(a)! : `(${kind.get(a)})`));
    const outs = edges.filter(([a]) => a === id).map(([, b]) => (kind.get(b) === 'step' ? label.get(b)! : `(${kind.get(b)})`));
    trans.push(`${list(ins)} --${tinfo.get(id)}--> ${list(outs)}`);
  }
  for (const [a, b] of edges) if (kind.get(a) === kind.get(b) && kind.get(a) !== undefined) notes.push(`liaison ${kind.get(a)} → ${kind.get(b)} (${label.get(a) ?? a} → ${label.get(b) ?? b})`);
  return { net: { steps, trans }, notes };
}

/** Réseau du modèle importé. */
function modelNet(g: Grafcet): Net {
  const fg = flatten(g);
  const byId = new Map<string, Node>();
  for (const s of g.seqs) for (const it of s.items) byId.set(it.id, it);
  const steps = new Map<string, string>();
  for (const it of byId.values()) {
    if (it.kind !== 'step') continue;
    steps.set(stepLabel(it.num), `${it.initial ? 'initiale ' : ''}${it.task ? 'tâche ' : ''}actions[${it.actions.map(actKey).sort().join(' | ')}]`);
  }
  const name = (id: string): string => { const n = byId.get(id); return n?.kind === 'step' ? stepLabel(n.num) : `(${n?.kind ?? '?'})`; };
  const trans: string[] = [];
  for (const it of byId.values()) {
    if (it.kind !== 'trans') continue;
    const ins = fg.links.filter((l) => l.to === it.id).map((l) => name(l.from));
    const outs = fg.links.filter((l) => l.from === it.id).map((l) => name(l.to));
    const acts = (it.actions ?? []).map(actKey).sort();
    trans.push(`${list(ins)} --${it.recept}${acts.length ? ' [' + acts.join(' | ') + ']' : ''}--> ${list(outs)}`);
  }
  return { steps, trans };
}

const diffMulti = (xml: string[], model: string[]): string[] => {
  const count = (xs: string[]): Map<string, number> => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return m; };
  const a = count(xml), b = count(model), out: string[] = [];
  for (const [k, n] of a) for (let i = 0; i < n - (b.get(k) ?? 0); i++) out.push('- ' + k);
  for (const [k, n] of b) for (let i = 0; i < n - (a.get(k) ?? 0); i++) out.push('+ ' + k);
  return out;
};

/** Compare un XML SFCEdit et le projet qui en a été importé, GRAFCET par GRAFCET (appariés par rang). */
export function checkSfcEditImport(xml: string, project: Project): GrafcetCheck[] {
  const root = parseXml(xml);
  const gxs = elements(root, 'grafcet');
  const out: GrafcetCheck[] = gxs.map((gx, i) => {
    const g = project.grafcets[i];
    const name = gx.attrs.name || `Grafcet ${i + 1}`;
    if (!g) return { grafcet: name, ok: false, steps: 0, transitions: 0, diffs: ['- GRAFCET absent du projet importé'] };
    const ref = referenceNet(gx), mod = modelNet(g);
    const diffs = [...ref.notes.map((n) => '! ' + n)];
    for (const [s, k] of ref.net.steps) {
      if (!mod.steps.has(s)) diffs.push(`- étape ${s}`);
      else if (mod.steps.get(s) !== k) diffs.push(`~ étape ${s} : XML « ${k} » ≠ modèle « ${mod.steps.get(s)} »`);
    }
    for (const s of mod.steps.keys()) if (!ref.net.steps.has(s)) diffs.push(`+ étape ${s}`);
    diffs.push(...diffMulti(ref.net.trans, mod.trans));
    return { grafcet: name, ok: diffs.every((d) => d.startsWith('!')), steps: ref.net.steps.size, transitions: ref.net.trans.length, diffs };
  });
  const eq = checkEquations(xml);
  for (const b of eq.bad) { const r = out.find((x) => x.grafcet === b.grafcet); const d = `≠ équation : XML « ${b.xml} » ↔ importé « ${b.imported} »`; if (r) { r.ok = false; r.diffs.push(d); } }
  if (project.grafcets.length > gxs.length) out.push({ grafcet: '(supplémentaires)', ok: false, steps: 0, transitions: 0, diffs: [`+ ${project.grafcets.length - gxs.length} GRAFCET en trop dans le projet`] });
  return out;
}
