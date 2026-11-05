import { docOrder, indexOf, type Grafcet, type GraphIndex, type HLink, type Node, type Seq } from '@grafcet/core';

export const GEO = { stepW: 44, stepH: 40, transH: 40, tick: 9, actH: 22, actGap: 14, pad: 18, bar: 6, seqGap: 40, ov: 6, jumpH: 46, arrivalH: 28, xBox: 30 } as const;

/** Mesure de la largeur d'un texte en pixels (fournie par le moteur de rendu). */
export type TextWidth = (s: string) => number;

export interface Line { x1: number; y1: number; x2: number; y2: number }
export interface ActionView { i: number; x: number; y: number; condW: number; labW: number; cond: string; text: string; cell: boolean }
interface BoxBase { id: string; x: number; y: number; l: number; r: number; h: number }
/** `arrivals` : numéros des étapes d'où part un renvoi vers cet élément (affichés au-dessus, avec une flèche entrante). */
export interface StepView extends BoxBase { kind: 'step'; num: string; w: number; macro: boolean; role: 'entry' | 'exit' | null; name: string; initial: boolean; acts: ActionView[]; arrivals: string[]; ay: number }
export interface TransView extends BoxBase { kind: 'trans'; num: number; recept: string; arrivals: string[]; ay: number; acts: ActionView[] }
export interface JumpView extends BoxBase { kind: 'jump'; label: string; broken: boolean }
/** Barre d'un lien : une ligne pour un lien OU, deux pour un lien ET. `open` : lien sans séquence amont (divergence) ou aval (convergence). */
export interface BarView { kind: 'bar'; id: string; link: 'div' | 'conv'; op: 'or' | 'and'; open: boolean; ys: number[]; x1: number; x2: number }
/** Emplacement « X » d'une séquence vide. */
export interface PlaceholderView extends BoxBase { kind: 'seq' }
export type View = StepView | TransView | JumpView | BarView | PlaceholderView;
/** Point d'ancrage du curseur : position de l'élément et de l'emplacement d'insertion (slot). */
export interface Focus {
  id: string; x: number; y: number;
  /** Emplacement d'insertion APRÈS l'élément. */
  slot: { x: number; y: number } | null;
  /** Emplacement d'insertion AVANT l'élément. */
  slotBefore: { x: number; y: number } | null;
}
export interface Layout { lines: Line[]; views: View[]; focus: Focus[]; bounds: { x: number; y: number; w: number; h: number } }

interface Measure { l: number; r: number; h: number; ag?: { condW: number; labW: number; w: number } | null }

/**
 * Mise en page d'un GRAFCET : les positions sont CALCULÉES depuis les séquences et les liens, jamais stockées.
 *  - verticalement : une séquence commence sous la barre de la divergence qui l'ouvre, ou sous la barre de la convergence
 *    dont elle est l'aval ; une convergence est placée sous la plus basse de ses branches ;
 *  - horizontalement : les arbres de divergences sont disposés comme des arbres, une séquence aval de convergence est
 *    centrée sous ses branches, puis les chevauchements sont résolus.
 */
export function layoutGrafcet(g: Grafcet, tw: TextWidth): Layout {
  const ix = indexOf(g);
  const lines: Line[] = [];
  const views: View[] = [];
  const focus: Focus[] = [];
  const L = (x1: number, y1: number, x2: number, y2: number) => lines.push({ x1, y1, x2, y2 });
  const seqs = docOrder(g);

  /* ---- renvois : numéros des étapes d'où l'on arrive, par cible ---- */
  const stepBefore = (s: Seq, seen = new Set<string>()): string | null => {
    if (seen.has(s.id)) return null;
    seen.add(s.id);
    for (let i = s.items.length - 1; i >= 0; i--) if (s.items[i]!.kind === 'step') return String(s.items[i]!.num);
    const su = ix.startUse.get(s.id);
    if (!su) return null;
    if (su.role === 'child') { const b = su.link.base ? ix.seq.get(su.link.base) : undefined; return b ? stepBefore(b, seen) : null; }
    for (const n of su.link.nodes) { const x = ix.seq.get(n); const r = x ? stepBefore(x, seen) : null; if (r) return r; }
    return null;
  };
  const arrivalsOf = new Map<string, string[]>();
  for (const j of g.jumps) {
    const from = ix.seq.get(j.from);
    const n = from ? stepBefore(from) : null;
    if (!j.to || n === null) continue;
    const a = arrivalsOf.get(j.to) ?? [];
    if (!a.includes(n)) a.push(n);
    arrivalsOf.set(j.to, a);
  }
  const arrivals = (id: string): string[] => arrivalsOf.get(id) ?? [];
  const arrTop = (id: string): number => (arrivals(id).length ? GEO.arrivalH : 0);
  const arrHalf = (id: string): number => (arrivals(id).length ? tw(arrivals(id).join(', ')) / 2 + 4 : 0);

  const actText = (a: { kind: string; label: string }) => (a.kind === 'activation' ? '↑ ' : a.kind === 'deactivation' ? '↓ ' : '') + (a.label || '?');
  const jumpLabel = (to: string | null) => {
    const t = to ? ix.node.get(to)?.item : undefined;
    return !t ? '?' : t.kind === 'step' ? String(t.num) : '(' + t.num + ')';
  };
  const sw = (it: Extract<Node, { kind: 'step' }>) => Math.max(GEO.stepW, Math.ceil(tw(it.num)) + 16);
  const actGeom = (it: { actions?: { kind: string; label: string; cond: string }[] }) => {
    const acts = it.actions ?? [];
    if (!acts.length) return null;
    const hasCond = (a: { kind: string; cond: string }) => a.kind === 'conditional' || a.kind === 'event';
    const hasC = acts.some(hasCond);
    const condW = hasC ? Math.max(28, ...acts.map((a) => (hasCond(a) ? tw(a.cond || '?') + 14 : 0))) : 0;
    const labW = Math.max(44, ...acts.map((a) => tw(actText(a)) + 16));
    return { condW, labW, w: condW + labW };
  };

  /* ---- mesures ---- */
  const memo = new Map<string, Measure>();
  function mNode(it: Node): Measure {
    const hit = memo.get(it.id);
    if (hit) return hit;
    let m: Measure;
    if (it.kind === 'step') {
      const ag = actGeom(it), nameW = it.name ? tw(it.name) + 10 : 0;
      m = {
        l: Math.max(sw(it) / 2 + nameW, arrHalf(it.id)), r: Math.max(sw(it) / 2 + (ag ? GEO.actGap + ag.w : 0), arrHalf(it.id)),
        h: arrTop(it.id) + Math.max(GEO.stepH, it.actions.length * GEO.actH + 10), ag,
      };
    } else {
      const ag = actGeom(it);
      m = {
        l: Math.max(GEO.tick + 8 + tw('(' + it.num + ')'), arrHalf(it.id)),
        r: Math.max(GEO.tick + 8 + tw(it.recept || '?') + (ag ? GEO.actGap + ag.w : 0), arrHalf(it.id)),
        h: arrTop(it.id) + Math.max(GEO.transH, (it.actions?.length ?? 0) * GEO.actH + 10), ag,
      };
    }
    memo.set(it.id, m);
    return m;
  }
  const jumpOf = new Map(g.jumps.map((j) => [j.from, j] as const));
  const seqM = new Map<string, Measure & { items: number }>();
  for (const s of seqs) {
    let l = 0, r = 0, h = 0;
    for (const it of s.items) { const m = mNode(it); l = Math.max(l, m.l); r = Math.max(r, m.r); h += m.h; }
    const j = jumpOf.get(s.id);
    if (j) { const half = Math.max(14, tw(jumpLabel(j.to)) / 2 + 4); l = Math.max(l, half); r = Math.max(r, half); }
    const itemsH = h;
    if (!s.items.length) { l = r = GEO.xBox / 2 + 4; h = GEO.xBox + 10; } else if (j) h += GEO.jumpH;
    seqM.set(s.id, { l, r, h, items: itemsH });
  }

  /* ---- hauteurs ---- */
  const barH = (l: HLink) => (l.op === 'and' ? GEO.bar : 0);
  const top = new Map<string, number>(), barY = new Map<string, number>();
  const bottom = (s: Seq): number => topOf(s) + seqM.get(s.id)!.h;
  function barOf(l: HLink, guard: number): number {
    const hit = barY.get(l.id);
    if (hit !== undefined) return hit;
    let y: number;
    if (l.kind === 'div') y = l.base && guard < 200 ? bottom(ix.seq.get(l.base)!) + GEO.pad : GEO.pad;
    else y = Math.max(...l.nodes.map((n) => bottom(ix.seq.get(n)!))) + GEO.pad;
    barY.set(l.id, y);
    return y;
  }
  let depth = 0;
  function topOf(s: Seq): number {
    const hit = top.get(s.id);
    if (hit !== undefined) return hit;
    let y = 0;
    const su = ix.startUse.get(s.id);
    if (su && depth < 500) { depth++; y = barOf(su.link, depth) + barH(su.link) + GEO.pad; depth--; }
    top.set(s.id, y);
    return y;
  }
  for (const s of seqs) topOf(s);

  /* ---- abscisses ---- */
  const x = new Map<string, number>();
  const kidsOf = (s: Seq): Seq[] => { const e = ix.endUse.get(s.id); return e && 'link' in e && e.role === 'base' ? e.link.nodes.map((n) => ix.seq.get(n)!) : []; };
  const ext = new Map<string, { l: number; r: number }>();
  const placed = new Set<string>();
  /** Place le sous-arbre de `s` (branches de sa divergence) ; abscisses relatives à `s`. Renvoie les étendues. */
  function tree(s: Seq, at: number, guard = 0): { l: number; r: number } {
    placed.add(s.id);
    const m = seqM.get(s.id)!;
    const kids = guard < 200 ? kidsOf(s).filter((k) => !placed.has(k.id)) : [];
    if (!kids.length) { x.set(s.id, at); return { l: m.l, r: m.r }; }
    const sub = kids.map((k) => ({ k, e: treeExt(k, guard + 1) }));
    const rel: number[] = [0];
    for (let i = 1; i < sub.length; i++) rel.push(rel[i - 1]! + sub[i - 1]!.e.r + GEO.seqGap + sub[i]!.e.l);
    const mid = (rel[0]! + rel[rel.length - 1]!) / 2;
    sub.forEach((c, i) => shift(c.k, at + rel[i]! - mid - x.get(c.k.id)!));
    x.set(s.id, at);
    const lo = Math.min(m.l, mid - rel[0]! + sub[0]!.e.l), hi = Math.max(m.r, rel[rel.length - 1]! - mid + sub[sub.length - 1]!.e.r);
    return { l: lo, r: hi };
  }
  /** Étendues d'un sous-arbre placé en 0 (mémorisées). */
  function treeExt(s: Seq, guard: number): { l: number; r: number } {
    const e = tree(s, 0, guard);
    ext.set(s.id, e);
    return e;
  }
  const shiftSet = new Map<string, Seq[]>();
  function shift(s: Seq, dx: number, seen = new Set<string>()): void {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    x.set(s.id, x.get(s.id)! + dx);
    for (const k of kidsOf(s)) if (x.has(k.id) && !isBase(k)) shift(k, dx, seen);
  }
  const isBase = (s: Seq) => ix.startUse.get(s.id)?.role === 'base';
  /** Séquences qui ouvrent un arbre : début libre (hors bases de convergence). */
  const roots = seqs.filter((s) => !ix.startUse.has(s.id) || (ix.startUse.get(s.id)!.role === 'child' && !ix.startUse.get(s.id)!.link.base));
  void shiftSet;
  // Les branches d'une divergence ouverte forment un arbre fictif : on les range côte à côte.
  let cursor = 0;
  const openDivs = new Map<string, HLink>();
  for (const l of g.links) if (l.kind === 'div' && !l.base) openDivs.set(l.id, l);
  const doneRoots = new Set<string>();
  const placeRoot = (s: Seq) => {
    if (placed.has(s.id) || doneRoots.has(s.id)) return;
    doneRoots.add(s.id);
    const e = tree(s, 0);
    const at = cursor + e.l;
    shift(s, at - x.get(s.id)!);
    cursor = at + e.r + GEO.seqGap;
  };
  for (const s of roots) placeRoot(s);
  // Séquences aval de convergence : centrées sous leurs branches, avec leur propre arbre.
  const bases = seqs.filter((s) => isBase(s));
  for (let guard = 0; guard < bases.length + 5; guard++) {
    let progress = false;
    for (const b of bases) {
      if (placed.has(b.id)) continue;
      const lk = ix.startUse.get(b.id)!.link;
      const ns = lk.nodes.map((n) => ix.seq.get(n)!);
      if (!ns.every((n) => x.has(n.id))) continue;
      const at = ns.reduce((a, n) => a + x.get(n.id)!, 0) / ns.length;
      tree(b, at);
      shift(b, at - x.get(b.id)!);
      progress = true;
    }
    if (!progress) break;
  }
  for (const s of seqs) if (!x.has(s.id)) { tree(s, cursor); cursor += 100; }

  /* ---- résolution des chevauchements (poussée vers la droite) puis recentrage des séquences portant une divergence ---- */
  const y0 = (s: Seq) => topOf(s) - 4, y1 = (s: Seq) => bottom(s) + 4;
  const byX = () => [...seqs].sort((a, b) => x.get(a.id)! - x.get(b.id)! || seqs.indexOf(a) - seqs.indexOf(b));
  for (let pass = 0; pass < 4; pass++) {
    const order = byX();
    for (let i = 0; i < order.length; i++) {
      const t = order[i]!, mt = seqM.get(t.id)!;
      let min = -Infinity;
      for (let k = 0; k < i; k++) {
        const s = order[k]!;
        if (y1(s) <= y0(t) || y1(t) <= y0(s)) continue;
        min = Math.max(min, x.get(s.id)! + seqM.get(s.id)!.r + GEO.seqGap + mt.l);
      }
      if (x.get(t.id)! < min) x.set(t.id, min);
    }
    // recentrage : base de divergence au milieu de ses branches, aval de convergence au milieu de ses branches
    for (const s of seqs) {
      const kids = kidsOf(s);
      if (kids.length && ix.startUse.get(s.id)?.role !== 'base') x.set(s.id, (x.get(kids[0]!.id)! + x.get(kids[kids.length - 1]!.id)!) / 2);
      const su = ix.startUse.get(s.id);
      if (su?.role === 'base') x.set(s.id, su.link.nodes.reduce((a, n) => a + x.get(n)!, 0) / su.link.nodes.length);
    }
  }
  const X = (s: Seq) => x.get(s.id)!;

  /* ---- dessin ---- */
  function drawNode(it: Node, cx: number, y: number): void {
    const m0 = mNode(it);
    const topPad = arrTop(it.id);
    const ay = y;
    if (topPad) { L(cx, y + 13, cx, y + topPad); y += topPad; }
    const m = topPad ? { ...m0, h: m0.h - topPad } : m0;
    if (it.kind === 'step') {
      const acts: ActionView[] = [];
      if (m.ag) {
        const ax = cx + sw(it) / 2 + GEO.actGap;
        it.actions.forEach((a, i) => acts.push({ i, x: ax, y: y + 9 + i * GEO.actH, condW: m.ag!.condW, labW: m.ag!.labW, cond: a.cond || '', text: actText(a), cell: a.kind === 'conditional' || a.kind === 'event' }));
        L(cx + sw(it) / 2, y + 20, ax, y + 20);
      }
      if (m.h > GEO.stepH) L(cx, y + GEO.stepH, cx, y + m.h);
      views.push({ kind: 'step', id: it.id, x: cx, y, l: m.l, r: m.r, h: m.h, num: it.num, w: sw(it), macro: it.expansion !== undefined, role: it.role ?? null, name: it.name, initial: it.initial, acts, arrivals: arrivals(it.id), ay });
      focus.push({ id: it.id, x: cx, y: y + 20, slot: { x: cx, y: y + GEO.stepH + 11 }, slotBefore: { x: cx, y: y - 11 } });
    } else {
      L(cx, y, cx, y + m.h);
      const acts: ActionView[] = [];
      if (m.ag) {
        const rx = cx + GEO.tick + 8 + tw(it.recept || '?') + 4, ax = rx + GEO.actGap;
        (it.actions ?? []).forEach((a, i) => acts.push({ i, x: ax, y: y + 9 + i * GEO.actH, condW: m.ag!.condW, labW: m.ag!.labW, cond: a.cond || '', text: actText(a), cell: !!(a.cond || '').trim() }));
        L(rx, y + 20, ax, y + 20);
      }
      views.push({ kind: 'trans', id: it.id, x: cx, y, l: m.l, r: m.r, h: m.h, num: it.num, recept: it.recept, arrivals: arrivals(it.id), ay, acts });
      focus.push({ id: it.id, x: cx, y: y + 20, slot: { x: cx, y: y + 31 }, slotBefore: { x: cx, y: y - 11 } });
    }
  }
  for (const s of seqs) {
    const cx = X(s), m = seqM.get(s.id)!;
    let y = topOf(s);
    if (!s.items.length) {
      views.push({ kind: 'seq', id: s.id, x: cx, y, l: m.l, r: m.r, h: m.h });
      focus.push({ id: s.id, x: cx, y: y + 20, slot: { x: cx, y: y + 20 }, slotBefore: null });
    }
    for (const it of s.items) { drawNode(it, cx, y); y += mNode(it).h; }
    const j = jumpOf.get(s.id);
    if (j && s.items.length) {
      L(cx, y, cx, y + 24);
      views.push({ kind: 'jump', id: j.id, x: cx, y, l: m.l, r: m.r, h: GEO.jumpH, label: jumpLabel(j.to), broken: !j.to || !ix.node.has(j.to) });
      focus.push({ id: j.id, x: cx, y: y + 16, slot: null, slotBefore: null });
    }
  }
  for (const l of g.links) {
    const by = barOf(l, 0), bh = barH(l), bys = l.op === 'and' ? [by + 1, by + bh - 1] : [by];
    const base = l.base ? ix.seq.get(l.base)! : null, ns = l.nodes.map((n) => ix.seq.get(n)!);
    const xs = [...ns.map(X), ...(base ? [X(base)] : [])];
    const mean = ns.reduce((a, n) => a + X(n), 0) / ns.length, bx = base ? X(base) : mean;
    const x1 = Math.min(...xs, bx) - GEO.ov, x2 = Math.max(...xs, bx) + GEO.ov;
    views.push({ kind: 'bar', id: l.id, link: l.kind, op: l.op, open: !base, ys: bys, x1, x2 });
    focus.push({ id: l.id, x: mean, y: by + bh / 2, slot: null, slotBefore: null });
    if (l.kind === 'div') {
      if (base) L(X(base), bottom(base), X(base), by); else L(bx, by - GEO.pad, bx, by);
      for (const n of ns) L(X(n), by + bh, X(n), topOf(n));
    } else {
      for (const n of ns) L(X(n), bottom(n), X(n), by);
      if (base) L(X(base), by + bh, X(base), topOf(base)); else L(bx, by + bh, bx, by + bh + GEO.pad);
    }
  }

  focus.sort((a, b) => a.y - b.y || a.x - b.x);
  let minX = Infinity, maxX = -Infinity, maxY = 0;
  for (const s of seqs) { const m = seqM.get(s.id)!; minX = Math.min(minX, X(s) - m.l); maxX = Math.max(maxX, X(s) + m.r); maxY = Math.max(maxY, bottom(s)); }
  for (const v of views) if (v.kind === 'bar') { minX = Math.min(minX, v.x1); maxX = Math.max(maxX, v.x2); maxY = Math.max(maxY, v.ys[v.ys.length - 1]! + GEO.pad); }
  if (!isFinite(minX)) { minX = 0; maxX = 0; }
  return { lines, views, focus, bounds: { x: minX, y: 0, w: maxX - minX, h: maxY } };
}
export type { GraphIndex };
