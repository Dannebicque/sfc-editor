import { computed, nextTick, reactive, ref, watch } from 'vue';
import { defineStore, storeToRefs } from 'pinia';
import {
  addBranch as addBranchCmd, addConvergence, addDivergence, addJump, addOpenLink, capabilities, connect, describeId, findNode, indexOf, insertNode,
  jumpTargets as jumpTargetsOf, mergeEnds, mergeStarts, moveBranch as moveBranchCmd, newSeq, nodesOf, parseRecept, removeBranch, removeJump, removeLink,
  removeNode, removeSeq, renumber, resolveLink, setJumpTarget, type Node, type Capabilities,
} from '@grafcet/core';
import { createExpansion, macrosOf, referencesTo, setMacro } from '@grafcet/core';
import { exportArchive, exportFolder, importArchive, importFolder, looksLikeZip, type FolderFile, exportNative, exportSfcEditXml, FORMAT_ID, importJson, importNative, importSfcEditXml, looksLikeSfcEditXml, exportPlcopenXml, importPlcopenXml, looksLikePlcopenXml, ImportError, type ReportEntry } from '@grafcet/io';
import { buildSimulation, enabledTransitions, fire, macroActive } from '@grafcet/simulation';
import { describeText, renderMessage } from '../format';
import { isLegalDocId, type LegalDocId } from '../legal';
import { applyLang, kindLabel, KEYMAP, LS_PREFIX, T, lang, type Lang } from '../i18n';
import { useProjectStore } from './project';
import { useViewStore } from './view';

export type TabId = 'props' | 'issues' | 'text' | 'data';
export type Theme = 'auto' | 'light' | 'dark';
export type InsertWhere = 'before' | 'after';

/** État d'interface : sélection, onglets, thème, simulation, import/export, et les commandes « utilisateur » qui combinent document + sélection + annonces. */
export const useUiStore = defineStore('ui', () => {
  const project = useProjectStore();
  const viewStore = useViewStore();
  const { activeG, flat, project: projectRef } = storeToRefs(project);

  const sel = ref<string | null>(null);
  const tab = ref<TabId>('props');
  const theme = ref<Theme>('auto');
  const dataView = ref<'json' | 'graph' | 'native' | 'sfcedit' | 'plcopen'>('json');
  /** Côté d'insertion choisi pour les éléments simples (les blocs imposent le leur : barre = avant, convergence = après). */
  const insertWhere = ref<InsertWhere>('after');
  const sim = reactive({ on: false, active: [] as string[], root: '' });

  /* ----- annonces pour lecteurs d'écran ----- */
  const liveMsg = ref('');
  let flip = false;
  const announce = (m: string): void => { flip = !flip; liveMsg.value = m + (flip ? '' : '​'); };

  /* ----- sélection ----- */
  const ix = computed(() => indexOf(activeG.value));
  /** Élément (étape ou transition) sélectionné ; null si la sélection est une barre, un renvoi ou un emplacement vide. */
  const selItem = computed<Node | null>(() => (sel.value ? ix.value.node.get(sel.value)?.item ?? null : null));
  /** Position de l'élément sélectionné dans sa séquence (début, fin) : conditions de « relier » et « réunir ». */
  const selEnds = computed(() => {
    const n = sel.value ? ix.value.node.get(sel.value) : undefined;
    return n ? { first: n.idx === 0, last: n.idx === n.seq.items.length - 1 } : { first: false, last: false };
  });
  const selLink = computed(() => (sel.value ? ix.value.link.get(sel.value) ?? null : null));
  const selJump = computed(() => (sel.value ? ix.value.jump.get(sel.value) ?? null : null));
  const selEmpty = computed(() => { const q = sel.value ? ix.value.seq.get(sel.value) : undefined; return q && !q.items.length ? q : null; });
  /** Branche (lien + rang) concernée par la sélection : barre, élément ou emplacement d'une branche. */
  const selBranch = computed(() => {
    const a = sel.value ? resolveLink(activeG.value, sel.value) : null;
    if (!a) return null;
    const at = a.seq ? a.link.nodes.indexOf(a.seq.id) : -1;
    return { link: a.link, index: at, count: a.link.nodes.length };
  });
  /**
   * Identifiant de la dernière étape sélectionnée. Il survit au changement de GRAFCET pour que l'étape de même identifiant
   * soit retrouvée (et mise en valeur) dans les autres GRAFCET du projet.
   */
  const linkedNum = ref<string | null>(null);
  watch(selItem, (it) => { if (it && it.kind === 'step') linkedNum.value = it.num; });
  /** Autres GRAFCET du projet qui contiennent une étape de même identifiant : [{ gid, name, itemId }]. */
  const linkedIn = computed(() => {
    const out: { gid: string; name: string; itemId: string }[] = [];
    if (linkedNum.value == null) return out;
    for (const g of projectRef.value.grafcets) {
      if (g.id === project.activeId) continue;
      const hit = nodesOf(g).find((it) => it.kind === 'step' && it.num === linkedNum.value)?.id ?? null;
      if (hit) out.push({ gid: g.id, name: g.name, itemId: hit });
    }
    return out;
  });
  /** Éléments (par GRAFCET) qui citent l'étape sélectionnée dans une réceptivité ou une condition d'action (« X13 »). */
  const referencedIn = computed(() => {
    const out = new Map<string, string[]>();
    if (linkedNum.value == null) return out;
    for (const g of projectRef.value.grafcets) {
      const ids = referencesTo(g, linkedNum.value, project.knownSteps);
      if (ids.length) out.set(g.id, ids);
    }
    return out;
  });
  /** Dans le GRAFCET ouvert : identifiants des éléments qui citent l'étape. */
  const citingActive = computed(() => new Set(referencedIn.value.get(project.activeId) ?? []));
  /** Dans les autres GRAFCET : où l'étape est citée (premier élément à rejoindre, nombre de citations). */
  const citedIn = computed(() =>
    projectRef.value.grafcets.filter((g) => g.id !== project.activeId && referencedIn.value.has(g.id))
      .map((g) => ({ gid: g.id, name: g.name, itemId: referencedIn.value.get(g.id)![0]!, count: referencedIn.value.get(g.id)!.length })));
  /** Identifiant à mettre en valeur dans le canevas : seulement s'il existe dans plusieurs GRAFCET. */
  const sharedNum = computed(() => (linkedIn.value.length ? linkedNum.value : null));
  const selText = computed(() => describeText(describeId(activeG.value, sel.value)));
  const selShort = computed(() => { const t = selText.value; return t.length > 46 ? t.slice(0, 45) + '…' : t; });

  /** Ce que la sélection permet (barre d'outils) ; rien pendant la simulation. */
  const caps = computed<Capabilities | null>(() => (sim.on ? null : capabilities(activeG.value, sel.value)));
  /** Côté d'insertion effectivement utilisé pour une étape ou une transition. */
  const whereNow = computed<InsertWhere>(() => (selEmpty.value ? 'after' : insertWhere.value));
  const slotPos = computed(() => {
    if (sim.on || !sel.value || !caps.value) return null;
    const c = caps.value.insert;
    if (!(c.step[whereNow.value] || c.trans[whereNow.value])) return null;
    const f = viewStore.layout.focus.find((x) => x.id === sel.value);
    return (whereNow.value === 'before' ? f?.slotBefore : f?.slot) ?? null;
  });
  const jumpTargets = computed(() => {
    const j = selJump.value;
    if (!j) return [];
    return jumpTargetsOf(activeG.value, j.id).map((id) => {
      const x = ix.value.node.get(id)!.item;
      return { id, label: x.kind === 'step' ? T('d_step', { n: x.num }) + (x.name ? ' · ' + x.name : '') : T('d_trans', { n: x.num }) + (x.recept ? ' : ' + x.recept : '') };
    });
  });
  const recFb = computed(() => {
    const it = selItem.value;
    if (!it || it.kind !== 'trans') return { cls: 'ok', msg: '' };
    if (!it.recept.trim()) return { cls: 'warn', msg: T('rf_empty') };
    const r = parseRecept(it.recept);
    return r.ok
      ? { cls: 'ok', msg: T('rf_ok') + (r.vars.size ? T('rf_vars', { v: [...r.vars].join(', ') }) : '') }
      : { cls: 'err', msg: T('rf_err', { e: renderMessage(r.error!) }) };
  });
  const tokens = computed(() => [
    { v: ' . ', t: T('tk_and') }, { v: ' + ', t: T('tk_or') }, { v: '/', t: T('tk_not') }, { v: '↑', t: T('tk_rise') },
    { v: '↓', t: T('tk_fall') }, { v: 'X', t: T('tk_step') }, { v: 't1/X0/2s', t: T('tk_delay') },
  ]);
  const tabs = computed(() => [
    { id: 'props' as const, label: T('tab_props') }, { id: 'issues' as const, label: T('tab_issues') },
    { id: 'text' as const, label: T('tab_text') }, { id: 'data' as const, label: T('tab_data') },
  ]);

  watch(sel, (v) => { if (v) announce(describeText(describeId(activeG.value, v))); });

  /* ----- édition (commandes utilisateur) ----- */
  const after = (id: string | null, msgKey = 'a_added') => {
    if (!id) return;
    sel.value = id;
    nextTick(() => viewStore.reveal(id));
    nextTick(() => announce(T(msgKey, { d: describeText(describeId(activeG.value, id)), list: '' })));
  };
  /** Insère une étape ou une transition ; `invert` insère du côté opposé au mode courant (raccourci Maj + lettre). */
  function insertKind(kind: 'step' | 'trans', invert = false): void {
    if (!sel.value || sim.on) return;
    const where: InsertWhere = selEmpty.value ? 'after' : invert ? (insertWhere.value === 'after' ? 'before' : 'after') : insertWhere.value;
    if (!caps.value?.insert[kind][where]) { announce(T('a_impossible', { k: kindLabel(kind) })); return; }
    const target = sel.value;
    after(project.mutate((g, P) => insertNode(P, g, target, kind, where)));
  }
  /** Divergence (après l'élément) ou convergence (avant l'élément), en OU ou en ET. */
  function addLinkAt(kind: 'div' | 'conv', op: 'or' | 'and'): void {
    if (!sel.value || sim.on) return;
    const target = sel.value;
    const id = project.mutate((g, P) => (kind === 'div' ? addDivergence(P, g, target, op) : addConvergence(P, g, target, op)));
    if (!id) { announce(T('a_impossible', { k: T('k_' + kind + '_' + op) })); return; }
    after(id, 'a_link_added');
  }
  function addJumpSel(): void {
    if (!sel.value || sim.on) return;
    const target = sel.value;
    const id = project.mutate((g, P) => addJump(P, g, target));
    if (!id) { announce(T('a_impossible', { k: T('k_jump') })); return; }
    after(id, 'a_jump_added');
  }
  /** Supprime la sélection : élément (avec son intercalaire), barre (les séquences restent), renvoi ou emplacement vide. */
  function removeSel(): void {
    const id = sel.value;
    if (!id || sim.on) return;
    let next: string | null | undefined;
    if (ix.value.node.has(id)) { const r = project.mutate((g) => removeNode(g, id)); if (!r.ok) { announce(T('a_cannot_delete')); return; } next = r.nextSel; }
    else if (ix.value.link.has(id)) next = project.mutate((g) => removeLink(g, id));
    else if (ix.value.jump.has(id)) next = project.mutate((g) => removeJump(g, id));
    else if (project.mutate((g) => removeSeq(g, id))) next = null;
    else { announce(T('a_cannot_delete')); return; }
    sel.value = next ?? viewStore.layout.focus[0]?.id ?? null;
    const n = sel.value;
    nextTick(() => n && viewStore.reveal(n));
    announce(T('a_deleted'));
  }
  function setField(field: string, value: unknown, coalesce = false): void {
    const id = sel.value;
    if (!id) return;
    project.mutate((g) => { const it = findNode(g, id); if (it) (it as unknown as Record<string, unknown>)[field] = value; }, coalesce ? { key: 'f:' + id + field } : {});
  }
  function setAction(i: number, field: 'label' | 'kind' | 'cond', value: string): void {
    const id = sel.value;
    project.mutate((g) => { const it = findNode(g, id!); const l = it && (it.kind === 'step' || it.kind === 'trans') ? it.actions : undefined; if (l && l[i]) (l[i] as unknown as Record<string, string>)[field] = value; }, { key: 'a:' + id + i + field });
  }
  function addAction(): void {
    const id = sel.value;
    project.mutate((g) => { const it = findNode(g, id!); if (it && it.kind === 'step') it.actions.push({ kind: 'continue', label: '', cond: '' }); else if (it && it.kind === 'trans') (it.actions ??= []).push({ kind: 'event', label: '', cond: '' }); });
    nextTick(() => {
      const els = [...document.querySelectorAll<HTMLInputElement>('.acts li input[type=text]')];
      els.filter((e) => e.placeholder === T('act_ph')).pop()?.focus();
    });
  }
  function delAction(i: number): void {
    const id = sel.value;
    project.mutate((g) => { const it = findNode(g, id!); if (it && (it.kind === 'step' || it.kind === 'trans')) { it.actions?.splice(i, 1); if (it.kind === 'trans' && !it.actions?.length) delete it.actions; } });
  }
  function addToken(t: string): void {
    const id = sel.value;
    project.mutate((g) => { const it = findNode(g, id!); if (it && it.kind === 'trans') it.recept = it.recept + t; });
    nextTick(() => {
      const el = document.getElementById('f-rec') as HTMLInputElement | null;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    });
  }
  function addBranch(side: -1 | 1): void {
    const base = sel.value;
    if (!base) return;
    const id = project.mutate((g, P) => addBranchCmd(P, g, base, side));
    if (!id) return;
    sel.value = id;
    nextTick(() => viewStore.reveal(id));
    announce(T('a_branch_added'));
  }
  function delBranch(): void {
    const base = sel.value;
    if (!base) return;
    const next = project.mutate((g) => removeBranch(g, base));
    if (next) { sel.value = next; announce(T('a_branch_deleted')); }
  }
  function moveBranch(dir: -1 | 1): void {
    const base = sel.value;
    if (!base) return;
    if (project.mutate((g) => moveBranchCmd(g, base, dir))) { nextTick(() => sel.value && viewStore.reveal(sel.value)); announce(T('a_branch_moved')); }
  }
  const canMoveBranch = (dir: -1 | 1) => { const b = selBranch.value; return !!b && b.index >= 0 && b.index + dir >= 0 && b.index + dir < b.count; };
  function setJump(target: string): void {
    const id = sel.value;
    if (id) project.mutate((g, P) => setJumpTarget(P, g, id, target || null));
  }

  /* ----- relier : commandes qui demandent un second élément ----- */
  type PendingKind = 'connect' | 'jump' | 'mergeEnds' | 'mergeStarts';
  const pending = ref<{ kind: PendingKind; from: string } | null>(null);
  function startPending(kind: PendingKind): void {
    if (!sel.value || sim.on || !selItem.value) return;
    pending.value = { kind, from: sel.value };
    announce(T('a_pending_' + kind));
  }
  function cancelPending(): void { if (pending.value) { pending.value = null; announce(T('a_pending_cancel')); } }
  function completePending(to: string): void {
    const p = pending.value;
    if (!p) return;
    if (!ix.value.node.has(to)) { announce(T('a_pending_need_node')); return; }
    const run = (g: Parameters<Parameters<typeof project.mutate>[0]>[0], P: Parameters<Parameters<typeof project.mutate>[0]>[1]) =>
      p.kind === 'connect' ? connect(P, g, p.from, to)
      : p.kind === 'jump' ? addJump(P, g, p.from, to)
      : p.kind === 'mergeEnds' ? mergeEnds(P, g, p.from, to) : mergeStarts(P, g, p.from, to);
    const id = project.mutate(run);
    if (!id) { announce(T('a_pending_impossible')); return; }
    pending.value = null;
    after(id, 'a_linked');
  }
  /** Nouvelle séquence libre, ou nouveau lien ouvert (divergence sans amont, convergence sans aval). */
  function addFree(what: 'seq' | 'div_or' | 'div_and' | 'conv_or' | 'conv_and'): void {
    if (sim.on) return;
    const id = project.mutate((g, P) => (what === 'seq' ? newSeq(P, g) : addOpenLink(P, g, what.startsWith('div') ? 'div' : 'conv', what.endsWith('or') ? 'or' : 'and')));
    after(id, 'a_added');
  }

  function doRenumber(): void { project.mutate((g) => renumber(g)); announce(T('a_renumbered')); }

  /* ----- GRAFCET du projet ----- */
  /* ----- macro-étapes ----- */
  function toggleMacro(on: boolean): void {
    const id = sel.value;
    if (id) project.mutate((g) => { setMacro(g, id, on); });
  }
  function setExpansion(gid: string | null): void {
    const id = sel.value;
    if (id) project.mutate((g) => { const it = findNode(g, id); if (it && it.kind === 'step' && it.expansion !== undefined) it.expansion = gid; });
  }
  function makeExpansion(): void {
    const id = sel.value;
    if (!id) return;
    const gid = project.mutate((g, P) => {
      const it = findNode(g, id);
      return it && it.kind === 'step' ? createExpansion(P, g, id, T('expansion_name', { n: it.num }))?.id ?? null : null;
    });
    if (gid) { announce(T('a_expansion_created')); openG(gid); }
  }
  function setRole(role: string): void {
    const id = sel.value;
    if (!id) return;
    project.mutate((g) => {
      const it = findNode(g, id);
      if (!it || it.kind !== 'step') return;
      if (role === 'entry' || role === 'exit') it.role = role; else delete it.role;
    });
  }
  /** Ouvre l'expansion de la macro-étape sélectionnée (ou de celle dont l'id est donné). */
  function openExpansion(id?: string): void {
    const it = findNode(activeG.value, id ?? sel.value ?? '');
    if (it && it.kind === 'step' && typeof it.expansion === 'string') openG(it.expansion);
  }
  /** Macro-étapes (dans tout le projet) dont ce GRAFCET est l'expansion. */
  const parentsOfActive = computed(() => {
    const out: { gid: string; name: string; itemId: string; num: string }[] = [];
    for (const g of projectRef.value.grafcets) for (const m of macrosOf(g)) if (m.expansion === project.activeId) out.push({ gid: g.id, name: g.name, itemId: m.id, num: m.num });
    return out;
  });
  function openG(id: string, selectId?: string): void {
    project.activeId = id;
    sel.value = null;
    if (!(sim.on && simGraph.value?.grafcets.has(id))) { sim.on = false; sim.active = []; }
    nextTick(() => {
      viewStore.fit(false);
      let want = selectId ?? null;
      if (!want && linkedNum.value != null) {
        const g = projectRef.value.grafcets.find((x) => x.id === id);
        if (g) want = nodesOf(g).find((it) => it.kind === 'step' && it.num === linkedNum.value)?.id ?? null;
      }
      sel.value = want ?? viewStore.layout.focus[0]?.id ?? null;
      if (want) { const w = want; nextTick(() => viewStore.reveal(w)); }
      project.persist();
    });
  }
  const addGrafcet = () => openG(project.addGrafcet());
  const dupGrafcet = () => openG(project.dupGrafcet());
  function delGrafcet(): void {
    const next = project.delGrafcet();
    if (next) { openG(next); announce(T('a_g_deleted')); }
  }

  /* ----- sélection / clavier ----- */
  function pick(id: string): void {
    if (sim.on) { if (simEnabled.value.has(id)) simFire(id); return; }
    if (pending.value && id !== pending.value.from) { completePending(id); return; }
    sel.value = id;
  }
  function pickFromText(id: string): void { sel.value = id; nextTick(() => viewStore.reveal(id)); }
  function focusHost(): void { viewStore.host?.focus(); }
  function onHostFocus(): void {
    if (!sel.value && !sim.on) { const f = viewStore.layout.focus[0]; if (f) sel.value = f.id; }
  }
  function focusMainField(): void {
    tab.value = 'props';
    nextTick(() => document.querySelector<HTMLElement>('#pan-props [data-main-field]')?.focus());
  }
  function goIssue(it: { id: string | null }): void {
    if (it.id) { sel.value = it.id; nextTick(() => { viewStore.reveal(it.id!); focusHost(); }); }
  }
  function onKey(e: KeyboardEvent): void {
    if (e.target !== viewStore.host) return;
    const k = e.key, lk = k.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && lk === 'z') { e.preventDefault(); project.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (lk === 'y' || (e.shiftKey && lk === 'z'))) { e.preventDefault(); project.redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k.startsWith('Arrow')) { e.preventDefault(); viewStore.navigate(k.slice(5).toLowerCase() as 'up' | 'down' | 'left' | 'right'); return; }
    if (sim.on) {
      if (k === 'Escape') toggleSim();
      else if ((k === 'Enter' || k === ' ') && sel.value) { e.preventDefault(); pick(sel.value); }
      return;
    }
    if (pending.value) {
      if (k === 'Escape') { e.preventDefault(); cancelPending(); } else if ((k === 'Enter' || k === ' ') && sel.value) { e.preventDefault(); completePending(sel.value); }
      return;
    }
    const km = KEYMAP[lang.value];
    if (lk === km.step.toLowerCase()) { e.preventDefault(); insertKind('step', e.shiftKey); return; }
    if (lk === km.trans.toLowerCase()) { e.preventDefault(); insertKind('trans', e.shiftKey); return; }
    if (lk === km.or.toLowerCase()) { e.preventDefault(); addLinkAt(e.shiftKey ? 'conv' : 'div', 'or'); return; }
    if (lk === km.and.toLowerCase()) { e.preventDefault(); addLinkAt(e.shiftKey ? 'conv' : 'div', 'and'); return; }
    if (lk === km.jump.toLowerCase()) { e.preventDefault(); addJumpSel(); return; }
    if (lk === km.link.toLowerCase()) { e.preventDefault(); startPending('connect'); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); removeSel(); return; }
    if (k === 'Enter') { e.preventDefault(); focusMainField(); return; }
    if (k === 'Escape') { sel.value = null; return; }
    if (k === '+' || k === '=') viewStore.zoomBy(1.2);
    else if (k === '-') viewStore.zoomBy(1 / 1.2);
    else if (k === '0') viewStore.fit(true);
    else if (k === 'Home') viewStore.selectEdge('first');
    else if (k === 'End') viewStore.selectEdge('last');
  }

  /* ----- simulation (jeu de jetons, sans évaluation des réceptivités) ----- */
  /** Graphe de simulation : le GRAFCET où elle a démarré, avec les expansions de ses macro-étapes. */
  const simGraph = computed(() => (sim.on ? buildSimulation(projectRef.value, sim.root) : null));
  const simActive = computed(() => {
    const g = simGraph.value;
    if (!g) return new Set<string>();
    const marking = new Set(sim.active);
    const out = new Set(marking);
    for (const id of g.members.keys()) if (macroActive(g, marking, id)) out.add(id);
    return out;
  });
  const simEnabled = computed(() => (simGraph.value ? enabledTransitions(simGraph.value.flat, new Set(sim.active)) : new Set<string>()));
  function simReset(): void { if (simGraph.value) sim.active = [...simGraph.value.initial]; }
  function simFire(tid: string): void { if (!simGraph.value) return; sim.active = [...fire(simGraph.value.flat, new Set(sim.active), tid)]; announce(T('a_fired')); }
  function toggleSim(): void {
    sim.on = !sim.on;
    if (sim.on) { sim.root = project.activeId; simReset(); announce(T('a_sim_on')); } else announce(T('a_sim_off'));
  }

  /* ----- données : vue, copie, import ----- */
  const dataText = computed(() => {
    if (dataView.value === 'native') return exportNative(projectRef.value).output;
    if (dataView.value === 'sfcedit') return exportSfcEditXml(projectRef.value).output;
    if (dataView.value === 'plcopen') return exportPlcopenXml(projectRef.value).output;
    return JSON.stringify(dataView.value === 'json' ? activeG.value : flat.value, null, 1);
  });
  const copyMsg = reactive({ text: '', cls: '' });
  const importMsg = reactive({ text: '', cls: '' });
  const importText = ref('');
  /** Rapport de conversion du dernier import / de l'export en cours (lignes déjà localisées). */
  const importReport = ref<{ level: ReportEntry['level']; text: string }[]>([]);
  const toLines = (es: ReportEntry[]) => es.map((e) => ({ level: e.level, text: renderMessage(e.message) }));
  const exportReport = computed(() =>
    dataView.value === 'sfcedit' ? toLines(exportSfcEditXml(projectRef.value).report.entries)
    : dataView.value === 'plcopen' ? toLines(exportPlcopenXml(projectRef.value).report.entries) : []);
  function copyData(): void {
    const done = (ok: boolean) => { copyMsg.text = ok ? T('copied') : T('copy_fail'); copyMsg.cls = ok ? 'ok' : 'err'; };
    try { navigator.clipboard.writeText(dataText.value).then(() => done(true), () => done(false)); } catch { done(false); }
  }
  /** Télécharge le projet au format natif (un fichier JSON déterministe). */
  function downloadNative(): void {
    const blob = new Blob([exportNative(projectRef.value).output], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (projectRef.value.name || 'projet').replace(/[^\w\-.]+/g, '_') + '.grafcet.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  /** Télécharge le projet au format XML de SFCEdit. */
  function downloadSfcEdit(): void {
    const blob = new Blob([exportSfcEditXml(projectRef.value).output], { type: 'application/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (projectRef.value.name || 'projet').replace(/[^\w\-.]+/g, '_') + '.xml';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  /** Télécharge le projet au format PLCopen XML (TC6 v2.01). */
  function downloadPlcopen(): void {
    saveAs(new Blob([exportPlcopenXml(projectRef.value).output], { type: 'application/xml' }), baseName() + '.plcopen.xml');
  }
  function applyImport(fileName?: string): void {
    importReport.value = [];
    try {
      let next, activeId: string;
      if (looksLikePlcopenXml(importText.value)) {
        const r = importPlcopenXml(importText.value, { projectName: (fileName ?? '').replace(/\.[^.]+$/, '') || undefined });
        commitImport(r.model, r.report.entries);
        return;
      }
      if (looksLikeSfcEditXml(importText.value)) {
        const base = (fileName ?? '').replace(/\.[^.]+$/, '') || T('p_imported');
        const r = importSfcEditXml(importText.value, { projectName: base });
        importReport.value = toLines(r.report.entries);
        project.replaceProject(r.model);
        openG(r.model.grafcets[0]!.id);
        importMsg.text = T('imp_ok'); importMsg.cls = 'ok'; importText.value = '';
        return;
      }
      const isNative = (() => { try { return JSON.parse(importText.value)?.format === FORMAT_ID; } catch { return false; } })();
      if (isNative) {
        const p = importNative(importText.value).model;
        next = p; activeId = p.grafcets[0]!.id;
      } else {
        const r = importJson(importText.value, projectRef.value, { grafcetName: T('g_imported'), projectName: T('p_imported') }).model;
        next = r.project; activeId = r.activeId;
      }
      project.replaceProject(next);
      openG(activeId);
      importMsg.text = T('imp_ok'); importMsg.cls = 'ok'; importText.value = '';
    } catch (e) {
      const m = e instanceof ImportError ? renderMessage(e.info) : String((e as Error).message ?? e);
      importMsg.text = T('imp_fail', { m }); importMsg.cls = 'err';
    }
  }
  const saveAs = (blob: Blob, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const baseName = () => (projectRef.value.name || 'projet').replace(/[^\w\-.]+/g, '_');
  /** Remplace le projet par un modèle déjà validé et affiche le résultat. */
  function commitImport(model: ReturnType<typeof importArchive>['model'], entries: ReportEntry[] = []): void {
    importReport.value = toLines(entries);
    project.replaceProject(model);
    openG(model.grafcets[0]!.id);
    importMsg.text = T('imp_ok'); importMsg.cls = 'ok'; importText.value = '';
  }
  function failImport(e: unknown): void {
    const m = e instanceof ImportError ? renderMessage(e.info) : String((e as Error).message ?? e);
    importMsg.text = T('imp_fail', { m }); importMsg.cls = 'err';
  }
  /** Télécharge le projet en archive ZIP déterministe (un fichier par GRAFCET). */
  function downloadArchive(): void {
    saveAs(new Blob([exportArchive(projectRef.value).output as BlobPart], { type: 'application/zip' }), baseName() + '.grafcet.zip');
  }
  /** Dossier : seulement avec l'API File System Access (Chromium). */
  const canFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  type Dir = { getFileHandle(n: string, o?: { create: boolean }): Promise<{ createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>; getFile(): Promise<File> }>; getDirectoryHandle(n: string, o?: { create: boolean }): Promise<Dir>; values(): AsyncIterable<{ kind: string; name: string }> };
  const pickDir = (mode: 'read' | 'readwrite') => (window as unknown as { showDirectoryPicker(o: { mode: string }): Promise<Dir> }).showDirectoryPicker({ mode });
  async function saveFolder(): Promise<void> {
    try {
      const root = await pickDir('readwrite');
      for (const f of exportFolder(projectRef.value).output) {
        const parts = f.path.split('/'); const file = parts.pop()!;
        let dir = root;
        for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
        const w = await (await dir.getFileHandle(file, { create: true })).createWritable();
        await w.write(f.text); await w.close();
      }
      importMsg.text = T('folder_saved'); importMsg.cls = 'ok';
    } catch (e) { if ((e as Error).name !== 'AbortError') failImport(e); }
  }
  async function openFolder(): Promise<void> {
    try {
      const root = await pickDir('read');
      const files: FolderFile[] = [];
      const head = await (await root.getFileHandle('project.json')).getFile();
      files.push({ path: 'project.json', text: await head.text() });
      const gdir = await root.getDirectoryHandle('grafcets');
      for await (const ent of gdir.values()) if (ent.kind === 'file' && ent.name.endsWith('.json')) files.push({ path: 'grafcets/' + ent.name, text: await (await (await gdir.getFileHandle(ent.name)).getFile()).text() });
      const r = importFolder(files);
      commitImport(r.model, r.report.entries);
    } catch (e) { if ((e as Error).name !== 'AbortError') failImport(e); }
  }
  function onFile(e: Event): void {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const bytes = new Uint8Array(r.result as ArrayBuffer);
      if (looksLikeZip(bytes)) {
        try { const x = importArchive(bytes); commitImport(x.model, x.report.entries); } catch (err) { failImport(err); }
      } else { importText.value = new TextDecoder('utf-8').decode(bytes); applyImport(f.name); }
    };
    r.readAsArrayBuffer(f);
    input.value = '';
  }

  /* ----- thème, langue ----- */
  const themeLabel = computed(() => T('theme_' + theme.value));
  function applyTheme(): void {
    const r = document.documentElement;
    if (theme.value === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme.value);
    viewStore.invalidateFonts();
  }
  function cycleTheme(): void {
    theme.value = theme.value === 'auto' ? 'light' : theme.value === 'light' ? 'dark' : 'auto';
    applyTheme();
    try { localStorage.setItem(LS_PREFIX + '-theme', theme.value); } catch { /* ignoré */ }
  }
  function setLang(nl: Lang): void {
    if (nl === lang.value) return;
    applyLang(nl);
    project.syncDemoLanguage();
    announce(T('a_lang'));
  }

  /* ----- informations légales : dialogue adressable par #/legal/<doc> ----- */
  const legalDoc = ref<LegalDocId | null>(null);
  function openLegal(id: LegalDocId = 'mentions'): void {
    legalDoc.value = id;
    if (location.hash !== `#/legal/${id}`) location.hash = `/legal/${id}`;
  }
  function closeLegal(): void {
    legalDoc.value = null;
    if (location.hash.startsWith('#/legal/')) history.replaceState(null, '', location.pathname + location.search);
  }
  function syncLegalFromHash(): void {
    const m = /^#\/legal\/(\w+)$/.exec(location.hash);
    legalDoc.value = m && isLegalDocId(m[1]!) ? (m[1] as LegalDocId) : null;
  }

  /** À appeler une fois l'interface montée : thème mémorisé, cadrage, sélection de l'étape 1. */
  function init(): void {
    try {
      const t = localStorage.getItem(LS_PREFIX + '-theme') as Theme | null;
      if (t === 'light' || t === 'dark' || t === 'auto') { theme.value = t; applyTheme(); }
    } catch { /* ignoré */ }
    nextTick(() => {
      viewStore.fit(false);
      const s1 = nodesOf(activeG.value).find((it) => it.kind === 'step' && it.num === '1')?.id ?? null;
      sel.value = s1 ?? viewStore.layout.focus[0]?.id ?? null;
      if (sel.value) { const id = sel.value; nextTick(() => viewStore.reveal(id)); }
    });
    document.fonts?.ready.then(() => viewStore.invalidateFonts());
    syncLegalFromHash();
    window.addEventListener('hashchange', syncLegalFromHash);
  }

  return {
    sel, tab, tabs, linkedNum, linkedIn, sharedNum, citingActive, citedIn, theme, themeLabel, dataView, sim, liveMsg, announce, insertWhere, whereNow,
    selItem, selEnds, selLink, selJump, selEmpty, selBranch, selText, selShort, caps, slotPos, jumpTargets, recFb, tokens, pending,
    moveBranch, canMoveBranch, insertKind, addLinkAt, addJumpSel, removeSel, setField, setAction, addAction, delAction, addToken, addBranch, delBranch, setJump,
    startPending, cancelPending, completePending, addFree, doRenumber,
    openG, addGrafcet, dupGrafcet, delGrafcet,
    pick, pickFromText, focusHost, onHostFocus, goIssue, onKey,
    simActive, simEnabled, simReset, simFire, toggleSim, toggleMacro, setExpansion, makeExpansion, setRole, openExpansion, parentsOfActive,
    dataText, importReport, exportReport, downloadSfcEdit, downloadPlcopen, downloadArchive, canFolder, saveFolder, openFolder, copyMsg, importMsg, importText, copyData, downloadNative, applyImport, onFile,
    legalDoc, openLegal, closeLegal, syncLegalFromHash,
    cycleTheme, setLang, init,
  };
});
