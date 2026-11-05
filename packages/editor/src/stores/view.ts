import { computed, nextTick, reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import { layoutGrafcet } from '@grafcet/layout';
import { useProjectStore } from './project';
import { useUiStore } from './ui';

/** Viewport (pan/zoom), mise en page du GRAFCET actif et navigation spatiale au clavier. */
export const useViewStore = defineStore('view', () => {
  const host = ref<HTMLElement | null>(null);
  const view = reactive({ x: 60, y: 30, z: 1 });
  const fontTick = ref(0);
  const twCache = new Map<string, number>();
  let ctx2d: CanvasRenderingContext2D | null = null;
  try { ctx2d = document.createElement('canvas').getContext('2d'); } catch { /* pas de canvas (tests) */ }

  /** Largeur d'un texte (police monospace de l'application) ; repli approximatif sans canvas. */
  function tw(s: string): number {
    const hit = twCache.get(s);
    if (hit !== undefined) return hit;
    let w: number;
    if (ctx2d) {
      ctx2d.font = '400 12.5px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-mono');
      w = ctx2d.measureText(s).width;
    } else w = s.length * 7.5;
    twCache.set(s, w);
    return w;
  }
  function invalidateFonts(): void { twCache.clear(); fontTick.value++; }

  const layout = computed(() => {
    void fontTick.value;
    return layoutGrafcet(useProjectStore().activeG, tw);
  });
  const shapes = computed(() => layout.value.views.filter((v) => v.kind !== 'region'));
  const gTransform = computed(() => `translate(${view.x},${view.y}) scale(${view.z})`);
  const gridStyle = computed(() => ({ '--z': Math.max(view.z, 0.25), '--px': view.x + 'px', '--py': view.y + 'px' }));

  function fit(all: boolean): void {
    const el = host.value;
    if (!el) return;
    const b = layout.value.bounds, cw = el.clientWidth, ch = el.clientHeight, pad = 44;
    let z = (cw - pad * 2) / Math.max(b.w, 1);
    if (all) z = Math.min(z, (ch - pad * 2 - 80) / Math.max(b.h, 1)); else z = Math.max(0.6, z);
    z = Math.min(1.15, Math.max(0.12, z));
    view.z = z;
    view.x = cw / 2 - (b.x + b.w / 2) * z;
    view.y = b.h * z + pad * 2 + 80 < ch ? Math.max(68, (ch - 80 - b.h * z) / 2) : 68;
  }
  function zoomAt(px: number, py: number, f: number): void {
    const nz = Math.min(2.5, Math.max(0.12, view.z * f));
    view.x = px - (px - view.x) * (nz / view.z);
    view.y = py - (py - view.y) * (nz / view.z);
    view.z = nz;
  }
  function zoomBy(f: number): void { const el = host.value; if (el) zoomAt(el.clientWidth / 2, el.clientHeight / 2, f); }
  function onWheel(e: WheelEvent): void {
    if (e.ctrlKey || e.metaKey) {
      const r = host.value!.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.01));
    } else { view.x -= e.deltaX; view.y -= e.deltaY; }
  }
  let pan: { x: number; y: number; vx: number; vy: number } | null = null;
  function panStart(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pan = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    (e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId);
  }
  function panMove(e: PointerEvent): void { if (pan) { view.x = pan.vx + e.clientX - pan.x; view.y = pan.vy + e.clientY - pan.y; } }
  function panEnd(): void { pan = null; }

  /** Fait défiler le canevas pour garder l'élément visible, avec des marges. */
  function reveal(id: string): void {
    const f = layout.value.focus.find((x) => x.id === id), el = host.value;
    if (!f || !el) return;
    const py = f.y * view.z + view.y, px = f.x * view.z + view.x;
    const mT = 70, mB = 120, mS = 90;
    let dx = 0, dy = 0;
    if (py < mT) dy = mT - py; else if (py > el.clientHeight - mB) dy = el.clientHeight - mB - py;
    if (px < mS) dx = mS - px; else if (px > el.clientWidth - mS) dx = el.clientWidth - mS - px;
    view.x += dx; view.y += dy;
  }

  /** Navigation flèches : l'ancre la plus proche dans la direction demandée. */
  function navigate(dir: 'up' | 'down' | 'left' | 'right'): void {
    const ui = useUiStore();
    const F = layout.value.focus;
    const cur = F.find((f) => f.id === ui.sel);
    if (!cur) { if (F.length) ui.sel = F[dir === 'up' ? F.length - 1 : 0]!.id; return; }
    let best: (typeof F)[number] | null = null, bs = Infinity;
    for (const f of F) {
      if (f.id === cur.id) continue;
      const dx = f.x - cur.x, dy = f.y - cur.y;
      let s: number;
      if (dir === 'down') { if (dy <= 4) continue; s = dy + Math.abs(dx); }
      else if (dir === 'up') { if (dy >= -4) continue; s = -dy + Math.abs(dx); }
      else if (dir === 'right') { if (dx <= 8) continue; s = dx + Math.abs(dy) * 3; }
      else { if (dx >= -8) continue; s = -dx + Math.abs(dy) * 3; }
      if (s < bs) { bs = s; best = f; }
    }
    if (best) { ui.sel = best.id; reveal(best.id); }
  }

  function selectEdge(which: 'first' | 'last'): void {
    const ui = useUiStore();
    const F = layout.value.focus;
    if (!F.length) return;
    const f = which === 'first' ? F[0]! : F[F.length - 1]!;
    ui.sel = f.id;
    reveal(f.id);
  }

  /** Après un changement de GRAFCET actif ou au montage : cadrer et sélectionner le premier élément. */
  function frameAndSelectFirst(): void {
    const ui = useUiStore();
    nextTick(() => { fit(false); ui.sel = layout.value.focus[0]?.id ?? null; });
  }

  return {
    host, view, layout, shapes, gTransform, gridStyle,
    tw, invalidateFonts, fit, zoomBy, zoomAt, onWheel, panStart, panMove, panEnd, reveal, navigate, selectEdge, frameAndSelectFirst,
  };
});
