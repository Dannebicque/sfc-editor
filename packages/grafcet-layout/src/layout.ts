import { walkAll, type Grafcet, type Item, type Block } from '@grafcet/core';

export const GEO = { stepW: 44, stepH: 40, transH: 40, tick: 9, actH: 22, actGap: 14, orPad: 18, andPad: 18, bar: 6, branchGap: 40, ov: 6, jumpH: 46, arrivalH: 28 } as const;

/** Mesure de la largeur d'un texte en pixels (fournie par le moteur de rendu). */
export type TextWidth = (s: string) => number;

export interface Line { x1: number; y1: number; x2: number; y2: number }
export interface ActionView { i: number; x: number; y: number; condW: number; labW: number; cond: string; text: string; cell: boolean }
interface BoxBase { id: string; x: number; y: number; l: number; r: number; h: number }
/** `arrivals` : numéros des étapes d'où part un renvoi vers cet élément (affichés au-dessus, avec une flèche entrante). */
export interface StepView extends BoxBase { kind: 'step'; num: string; w: number; macro: boolean; role: 'entry' | 'exit' | null; name: string; initial: boolean; acts: ActionView[]; arrivals: string[]; ay: number }
export interface TransView extends BoxBase { kind: 'trans'; num: number; recept: string; arrivals: string[]; ay: number }
export interface JumpView extends BoxBase { kind: 'jump'; label: string; broken: boolean }
export interface BarView { kind: 'bar'; id: string; part: 'd' | 'c'; ys: number[]; x1: number; x2: number }
export interface RegionView { kind: 'region'; id: string; x1: number; x2: number; y1: number; y2: number }
export type View = StepView | TransView | JumpView | BarView | RegionView;
/** Point d'ancrage du curseur : position de l'élément et de l'emplacement d'insertion (slot). */
export interface Focus {
  id: string; x: number; y: number;
  /** Emplacement d'insertion APRÈS l'élément. */
  slot: { x: number; y: number } | null;
  /** Emplacement d'insertion AVANT l'élément (ou le bloc, pour la barre de divergence). */
  slotBefore: { x: number; y: number } | null;
}
export interface Layout { lines: Line[]; views: View[]; focus: Focus[]; bounds: { x: number; y: number; w: number; h: number } }

interface Measure { l: number; r: number; h: number; ag?: ReturnType<ActGeomFn>; xs?: number[]; mx?: number; maxH?: number; bm?: Measure[] }
type ActGeomFn = (it: Extract<Item, { kind: 'step' }>) => { condW: number; labW: number; w: number } | null;

/** Mise en page récursive : les positions sont CALCULÉES depuis l'arbre, jamais stockées. */
export function layoutGrafcet(g: Grafcet, tw: TextWidth): Layout {
  const lines: Line[] = [];
  const views: View[] = [];
  const focus: Focus[] = [];
  const idx = new Map<string, Item>();
  walkAll(g.items, (it) => idx.set(it.id, it));
  const memo = new Map<Item, Measure>();

  /** Dernière étape avant l'index i d'une séquence (en traversant les blocs par leur première branche qui converge). */
  function stepBefore(seq: Item[], i: number): string | null {
    for (let j = i - 1; j >= 0; j--) {
      const it = seq[j]!;
      if (it.kind === 'step') return it.num;
      if (it.kind === 'trans' || it.kind === 'jump') continue;
      for (const b of it.branches) {
        if (!b.length || b[b.length - 1]!.kind === 'jump') continue;
        const n = stepBefore(b, b.length);
        if (n != null) return n;
      }
    }
    return null;
  }
  /** Pour chaque cible de renvoi : les numéros des étapes d'où l'on arrive. */
  const arrivalsOf = new Map<string, string[]>();
  (function collect(seq: Item[]): void {
    seq.forEach((it, i) => {
      if (it.kind === 'jump') {
        const n = it.target ? stepBefore(seq, i) : null;
        if (it.target && n != null) {
          const a = arrivalsOf.get(it.target) ?? [];
          if (!a.includes(String(n))) a.push(String(n));
          arrivalsOf.set(it.target, a);
        }
      } else if (it.kind === 'or' || it.kind === 'and') it.branches.forEach(collect);
    });
  })(g.items);
  const arrivals = (id: string): string[] => arrivalsOf.get(id) ?? [];
  const arrTop = (id: string): number => (arrivals(id).length ? GEO.arrivalH : 0);
  const arrHalf = (id: string): number => (arrivals(id).length ? tw(arrivals(id).join(', ')) / 2 + 4 : 0);
  const actText = (a: { kind: string; label: string }) => (a.kind === 'activation' ? '↑ ' : a.kind === 'deactivation' ? '↓ ' : '') + (a.label || '?');
  const jumpLabel = (it: Extract<Item, { kind: 'jump' }>) => {
    const t = it.target ? idx.get(it.target) : undefined;
    return !t ? '?' : t.kind === 'step' ? String(t.num) : '(' + (t as { num: number }).num + ')';
  };
  /** Largeur de la boîte d'une étape : s'élargit pour les identifiants longs (« INIT », « X12 »…). */
  const sw = (it: Extract<Item, { kind: 'step' }>) => Math.max(GEO.stepW, Math.ceil(tw(it.num)) + 16);
  const actGeom: ActGeomFn = (it) => {
    const acts = it.actions;
    if (!acts.length) return null;
    const hasCond = (k: string) => k === 'conditional' || k === 'event';
    const hasC = acts.some((a) => hasCond(a.kind));
    const condW = hasC ? Math.max(28, ...acts.map((a) => (hasCond(a.kind) ? tw(a.cond || '?') + 14 : 0))) : 0;
    const labW = Math.max(44, ...acts.map((a) => tw(actText(a)) + 16));
    return { condW, labW, w: condW + labW };
  };

  function mItem(it: Item): Measure {
    const hit = memo.get(it);
    if (hit) return hit;
    let m: Measure;
    if (it.kind === 'step') {
      const ag = actGeom(it), nameW = it.name ? tw(it.name) + 10 : 0;
      m = {
        l: Math.max(sw(it) / 2 + nameW, arrHalf(it.id)), r: Math.max(sw(it) / 2 + (ag ? GEO.actGap + ag.w : 0), arrHalf(it.id)),
        h: arrTop(it.id) + Math.max(GEO.stepH, it.actions.length * GEO.actH + 10), ag,
      };
    } else if (it.kind === 'trans') {
      m = { l: Math.max(GEO.tick + 8 + tw('(' + it.num + ')'), arrHalf(it.id)), r: Math.max(GEO.tick + 8 + tw(it.recept || '?'), arrHalf(it.id)), h: arrTop(it.id) + GEO.transH };
    } else if (it.kind === 'jump') {
      const half = Math.max(14, tw(jumpLabel(it)) / 2 + 4);
      m = { l: half, r: half, h: GEO.jumpH };
    } else {
      const bm = it.branches.map(mSeq);
      const xs = [0];
      for (let k = 1; k < bm.length; k++) xs.push(xs[k - 1]! + bm[k - 1]!.r + GEO.branchGap + bm[k]!.l);
      const last = xs.length - 1, mx = (xs[0]! + xs[last]!) / 2;
      const maxH = Math.max(...bm.map((b) => b.h));
      m = {
        l: Math.max(mx - xs[0]! + bm[0]!.l, mx - xs[0]! + GEO.ov),
        r: Math.max(xs[last]! + bm[last]!.r - mx, xs[last]! - mx + GEO.ov),
        h: it.kind === 'or' ? GEO.orPad + maxH + GEO.orPad : GEO.bar + GEO.andPad + maxH + GEO.andPad + GEO.bar,
        xs, mx, maxH, bm,
      };
    }
    memo.set(it, m);
    return m;
  }
  function mSeq(seq: Item[]): Measure {
    let l = 0, r = 0, h = 0;
    for (const it of seq) { const m = mItem(it); l = Math.max(l, m.l); r = Math.max(r, m.r); h += m.h; }
    return { l, r, h };
  }
  const L = (x1: number, y1: number, x2: number, y2: number) => lines.push({ x1, y1, x2, y2 });

  function dItem(it: Item, x: number, y: number): void {
    const m0 = mItem(it);
    const top = it.kind === 'step' || it.kind === 'trans' ? arrTop(it.id) : 0;
    const ay = y;
    if (top) { L(x, y + 13, x, y + top); y += top; }
    const m = top ? { ...m0, h: m0.h - top } : m0;
    if (it.kind === 'step') {
      const acts: ActionView[] = [];
      if (m.ag) {
        const ax = x + sw(it) / 2 + GEO.actGap;
        it.actions.forEach((a, i) => acts.push({ i, x: ax, y: y + 9 + i * GEO.actH, condW: m.ag!.condW, labW: m.ag!.labW, cond: a.cond || '', text: actText(a), cell: a.kind === 'conditional' || a.kind === 'event' }));
        L(x + sw(it) / 2, y + 20, ax, y + 20);
      }
      if (m.h > GEO.stepH) L(x, y + GEO.stepH, x, y + m.h);
      views.push({ kind: 'step', id: it.id, x, y, l: m.l, r: m.r, h: m.h, num: it.num, w: sw(it), macro: it.expansion !== undefined, role: it.role ?? null, name: it.name, initial: it.initial, acts, arrivals: arrivals(it.id), ay });
      focus.push({ id: it.id, x, y: y + 20, slot: { x, y: y + GEO.stepH + 11 }, slotBefore: { x, y: y - 11 } });
    } else if (it.kind === 'trans') {
      L(x, y, x, y + m.h);
      views.push({ kind: 'trans', id: it.id, x, y, l: m.l, r: m.r, h: m.h, num: it.num, recept: it.recept, arrivals: arrivals(it.id), ay });
      focus.push({ id: it.id, x, y: y + 20, slot: { x, y: y + 31 }, slotBefore: { x, y: y - 11 } });
    } else if (it.kind === 'jump') {
      L(x, y, x, y + 24);
      views.push({ kind: 'jump', id: it.id, x, y, l: m.l, r: m.r, h: m.h, label: jumpLabel(it), broken: !it.target || !idx.has(it.target) });
      focus.push({ id: it.id, x, y: y + 16, slot: null, slotBefore: null });
    } else {
      blockItem(it, x, y, m);
    }
  }

  function blockItem(it: Block, x: number, y: number, m: Measure): void {
    const isOr = it.kind === 'or';
    const xs = m.xs!, mx = m.mx!, maxH = m.maxH!, bm = m.bm!;
    const bxs = xs.map((v) => x + v - mx);
    const conv = it.branches.map((b) => b[b.length - 1]!.kind !== 'jump');
    const lastK = bxs.length - 1;
    views.push({ kind: 'region', id: it.id, x1: x - m.l, x2: x + m.r, y1: y, y2: y + m.h });
    if (isOr) {
      const yb1 = y + GEO.orPad, yb2 = yb1 + maxH;
      L(x, y, x, yb1);
      views.push({ kind: 'bar', id: it.id, part: 'd', ys: [yb1], x1: bxs[0]! - GEO.ov, x2: bxs[lastK]! + GEO.ov });
      focus.push({ id: it.id + ':d', x, y: yb1, slot: null, slotBefore: { x, y: y - 11 } });
      it.branches.forEach((b, k) => {
        dSeq(b, bxs[k]!, yb1);
        if (conv[k] && bm[k]!.h < maxH) L(bxs[k]!, yb1 + bm[k]!.h, bxs[k]!, yb2);
      });
      const cx = bxs.filter((_, k) => conv[k]);
      if (cx.length) {
        views.push({ kind: 'bar', id: it.id, part: 'c', ys: [yb2], x1: Math.min(...cx, x) - GEO.ov, x2: Math.max(...cx, x) + GEO.ov });
        L(x, yb2, x, yb2 + GEO.orPad);
      }
      focus.push({ id: it.id, x, y: yb2, slot: { x, y: yb2 + 11 }, slotBefore: null });
    } else {
      const yB = y + GEO.bar + GEO.andPad, yb2 = yB + maxH + GEO.andPad;
      views.push({ kind: 'bar', id: it.id, part: 'd', ys: [y + 1, y + GEO.bar - 1], x1: bxs[0]! - GEO.ov, x2: bxs[lastK]! + GEO.ov });
      focus.push({ id: it.id + ':d', x, y: y + 3, slot: null, slotBefore: { x, y: y - 11 } });
      it.branches.forEach((b, k) => {
        L(bxs[k]!, y + GEO.bar, bxs[k]!, yB);
        dSeq(b, bxs[k]!, yB);
        if (conv[k]) L(bxs[k]!, yB + bm[k]!.h, bxs[k]!, yb2);
      });
      const ax = bxs.filter((_, k) => conv[k]);
      views.push({ kind: 'bar', id: it.id, part: 'c', ys: [yb2 + 1, yb2 + GEO.bar - 1], x1: Math.min(...ax, x) - GEO.ov, x2: Math.max(...ax, x) + GEO.ov });
      focus.push({ id: it.id, x, y: yb2 + 3, slot: { x, y: yb2 + GEO.bar + 11 }, slotBefore: null });
    }
  }
  function dSeq(seq: Item[], x: number, y: number): void {
    let yy = y;
    for (const it of seq) { dItem(it, x, yy); yy += mItem(it).h; }
  }
  const root = mSeq(g.items);
  dSeq(g.items, 0, 0);
  return { lines, views, focus, bounds: { x: -root.l, y: 0, w: root.l + root.r, h: root.h } };
}
