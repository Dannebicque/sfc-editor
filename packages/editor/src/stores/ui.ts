import { computed, nextTick, reactive, ref, watch } from 'vue';
import { defineStore, storeToRefs } from 'pinia';
import {
  addBranch as addBranchCmd, allowedInsertions, canUnwrapBlock, canWrapInBlock, describeId, findItem, insertAt, isBlock,
  locate, moveBranch as moveBranchCmd, parseRecept, removeBranch, removeItem, renumber, unwrapBlock, walkAll,
  wrapInBlock, type BlockKind, type InsertWhere, type ItemKind,
} from '@grafcet/core';
import { exportArchive, exportFolder, importArchive, importFolder, looksLikeZip, type FolderFile, exportNative, exportSfcEditXml, FORMAT_ID, importJson, importNative, importSfcEditXml, looksLikeSfcEditXml, ImportError, type ReportEntry } from '@grafcet/io';
import { enabledTransitions, fire, initialMarking } from '@grafcet/simulation';
import { describeText, renderMessage } from '../format';
import { isLegalDocId, type LegalDocId } from '../legal';
import { applyLang, kindLabel, KEYMAP, LS_PREFIX, T, lang, type Lang } from '../i18n';
import { useProjectStore } from './project';
import { useViewStore } from './view';

export type TabId = 'props' | 'issues' | 'text' | 'data';
export type Theme = 'auto' | 'light' | 'dark';

/** État d'interface : sélection, onglets, thème, simulation, import/export, et les commandes « utilisateur » qui combinent document + sélection + annonces. */
export const useUiStore = defineStore('ui', () => {
  const project = useProjectStore();
  const viewStore = useViewStore();
  const { activeG, flat, project: projectRef } = storeToRefs(project);

  const sel = ref<string | null>(null);
  const tab = ref<TabId>('props');
  const theme = ref<Theme>('auto');
  const dataView = ref<'json' | 'graph' | 'native' | 'sfcedit'>('json');
  /** Côté d'insertion choisi pour les éléments simples (les blocs imposent le leur : barre = avant, convergence = après). */
  const insertWhere = ref<InsertWhere>('after');
  const sim = reactive({ on: false, active: [] as string[] });

  /* ----- annonces pour lecteurs d'écran ----- */
  const liveMsg = ref('');
  let flip = false;
  const announce = (m: string): void => { flip = !flip; liveMsg.value = m + (flip ? '' : '​'); };

  /* ----- sélection ----- */
  const selBase = computed(() => (sel.value ? sel.value.replace(':d', '') : null));
  const selLoc = computed(() => (selBase.value ? locate(activeG.value.items, selBase.value) : null));
  const selItem = computed(() => selLoc.value?.item ?? null);
  const isDivBar = computed(() => !!sel.value && sel.value.endsWith(':d'));
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
      let hit: string | null = null;
      walkAll(g.items, (it) => { if (!hit && it.kind === 'step' && it.num === linkedNum.value) hit = it.id; });
      if (hit) out.push({ gid: g.id, name: g.name, itemId: hit });
    }
    return out;
  });
  /** Identifiant à mettre en valeur dans le canevas : seulement s'il existe dans plusieurs GRAFCET. */
  const sharedNum = computed(() => (linkedIn.value.length ? linkedNum.value : null));
  const selText = computed(() => describeText(describeId(activeG.value, sel.value)));
  const selShort = computed(() => { const t = selText.value; return t.length > 46 ? t.slice(0, 45) + '…' : t; });

  /** Côté réellement utilisé : la barre de divergence impose « avant », la convergence « après ». */
  const effectiveWhere = (requested: InsertWhere): InsertWhere =>
    isDivBar.value ? 'before' : selItem.value && isBlock(selItem.value) ? 'after' : requested;
  const whereNow = computed(() => effectiveWhere(insertWhere.value));
  const whereFixed = computed(() => isDivBar.value || (!!selItem.value && isBlock(selItem.value)));

  const allowed = computed(() =>
    sim.on ? [] : allowedInsertions(activeG.value, sel.value, whereNow.value).map((o) => ({
      kind: o.kind, key: KEYMAP[lang.value][o.kind], label: kindLabel(o.kind), note: o.noteKey ? T(o.noteKey) : '',
    })));
  const slotPos = computed(() => {
    if (sim.on || !sel.value || !allowed.value.length) return null;
    const f = viewStore.layout.focus.find((x) => x.id === sel.value);
    return (whereNow.value === 'before' ? f?.slotBefore : f?.slot) ?? null;
  });
  const activeRegion = computed(() => {
    if (sim.on || !selItem.value || !isBlock(selItem.value)) return null;
    const r = viewStore.layout.views.find((v) => v.kind === 'region' && v.id === selBase.value);
    return r && r.kind === 'region' ? r : null;
  });
  const jumpTargets = computed(() => {
    const it = selItem.value, loc = selLoc.value;
    if (!it || it.kind !== 'jump' || !loc) return [];
    const prev = loc.seq[loc.idx - 1];
    const want = prev && prev.kind === 'step' ? 'trans' : 'step';
    const out: { id: string; label: string }[] = [];
    walkAll(activeG.value.items, (x) => {
      if (x.kind === 'step' && want === 'step') out.push({ id: x.id, label: T('d_step', { n: x.num }) + (x.name ? ' · ' + x.name : '') });
      if (x.kind === 'trans' && want === 'trans') out.push({ id: x.id, label: T('d_trans', { n: x.num }) + (x.recept ? ' : ' + x.recept : '') });
    });
    return out;
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
  /** Insère un élément ; `invert` insère du côté opposé au mode courant (raccourci Maj + lettre). */
  function insertKind(kind: ItemKind, invert = false): void {
    if (!sel.value || sim.on) return;
    const where = effectiveWhere(invert ? (insertWhere.value === 'after' ? 'before' : 'after') : insertWhere.value);
    if (!allowedInsertions(activeG.value, sel.value, where).some((o) => o.kind === kind)) { announce(T('a_impossible', { k: kindLabel(kind) })); return; }
    const target = sel.value;
    const newId = project.mutate((g, P) => insertAt(P, g, target, kind, where));
    sel.value = newId;
    nextTick(() => viewStore.reveal(newId));
    nextTick(() => announce(T('a_added', { d: describeText(describeId(activeG.value, newId)), list: allowed.value.map((o) => o.label).join(', ') || T('a_nothing') })));
  }
  function removeSel(): void {
    if (!sel.value || sim.on) return;
    const base = selBase.value!;
    const r = project.mutate((g) => removeItem(g, base));
    if (!r.ok) { announce(T('a_cannot_delete')); return; }
    sel.value = r.nextSel;
    const next = r.nextSel;
    nextTick(() => next && viewStore.reveal(next));
    announce(T('a_deleted'));
  }
  function setField(field: string, value: unknown, coalesce = false): void {
    const id = selBase.value;
    if (!id) return;
    project.mutate((g) => { const it = findItem(g.items, id); if (it) (it as unknown as Record<string, unknown>)[field] = value; }, coalesce ? { key: 'f:' + id + field } : {});
  }
  function setAction(i: number, field: 'label' | 'kind' | 'cond', value: string): void {
    const id = selBase.value;
    project.mutate((g) => { const it = findItem(g.items, id!); if (it && it.kind === 'step' && it.actions[i]) (it.actions[i] as unknown as Record<string, string>)[field] = value; }, { key: 'a:' + id + i + field });
  }
  function addAction(): void {
    const id = selBase.value;
    project.mutate((g) => { const it = findItem(g.items, id!); if (it && it.kind === 'step') it.actions.push({ kind: 'continue', label: '', cond: '' }); });
    nextTick(() => {
      const els = [...document.querySelectorAll<HTMLInputElement>('.acts li input[type=text]')];
      els.filter((e) => e.placeholder === T('act_ph')).pop()?.focus();
    });
  }
  function delAction(i: number): void {
    const id = selBase.value;
    project.mutate((g) => { const it = findItem(g.items, id!); if (it && it.kind === 'step') it.actions.splice(i, 1); });
  }
  function addToken(t: string): void {
    const id = selBase.value;
    project.mutate((g) => { const it = findItem(g.items, id!); if (it && it.kind === 'trans') it.recept = it.recept + t; });
    nextTick(() => {
      const el = document.getElementById('f-rec') as HTMLInputElement | null;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    });
  }
  function addBranch(side: -1 | 1): void {
    const base = selBase.value;
    if (!base) return;
    const id = project.mutate((g, P) => addBranchCmd(P, g, base, side));
    if (!id) return;
    sel.value = id;
    nextTick(() => viewStore.reveal(id));
    announce(T('a_branch_added'));
  }
  function delBranch(): void {
    const base = selBase.value;
    if (!base) return;
    const next = project.mutate((g) => removeBranch(g, base));
    if (next) { sel.value = next; announce(T('a_branch_deleted')); }
  }
  /* ----- structure : encadrer, dissoudre, déplacer ----- */
  const canWrap = (kind: BlockKind) => !sim.on && !!selBase.value && canWrapInBlock(activeG.value, selBase.value, kind);
  function wrap(kind: BlockKind): void {
    const base = selBase.value;
    if (!base || sim.on) return;
    const r = project.mutate((g, P) => wrapInBlock(P, g, base, kind));
    if (!r) { announce(T('a_wrap_impossible')); return; }
    sel.value = r.firstId;
    nextTick(() => viewStore.reveal(r.firstId));
    announce(T('a_wrapped'));
  }
  const canUnwrap = (keep: number) => !sim.on && !!selBase.value && canUnwrapBlock(activeG.value, selBase.value, keep);
  function unwrap(keep: number): void {
    const base = selBase.value;
    if (!base || sim.on) return;
    const first = project.mutate((g) => unwrapBlock(g, base, keep));
    if (!first) { announce(T('a_unwrap_impossible')); return; }
    sel.value = first;
    nextTick(() => viewStore.reveal(first));
    announce(T('a_unwrapped', { n: keep + 1 }));
  }
  function moveBranch(dir: -1 | 1): void {
    const base = selBase.value;
    if (!base) return;
    if (project.mutate((g) => moveBranchCmd(g, base, dir))) { nextTick(() => sel.value && viewStore.reveal(sel.value)); announce(T('a_branch_moved')); }
  }
  const canMoveBranch = (dir: -1 | 1) => {
    const loc = selLoc.value;
    return !!loc && !!loc.block && loc.branchIdx + dir >= 0 && loc.branchIdx + dir < loc.block.branches.length;
  };

  function doRenumber(): void { project.mutate((g) => renumber(g)); announce(T('a_renumbered')); }

  /* ----- GRAFCET du projet ----- */
  function openG(id: string, selectId?: string): void {
    project.activeId = id;
    sel.value = null;
    sim.on = false;
    sim.active = [];
    nextTick(() => {
      viewStore.fit(false);
      let want = selectId ?? null;
      if (!want && linkedNum.value != null) {
        const g = projectRef.value.grafcets.find((x) => x.id === id);
        if (g) walkAll(g.items, (it) => { if (!want && it.kind === 'step' && it.num === linkedNum.value) want = it.id; });
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
    const map: Record<string, ItemKind> = {};
    for (const kk of ['step', 'trans', 'or', 'and', 'jump'] as ItemKind[]) map[KEYMAP[lang.value][kk].toLowerCase()] = kk;
    if (map[lk]) { e.preventDefault(); insertKind(map[lk]!, e.shiftKey); return; }
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
  const simActive = computed(() => (sim.on ? new Set(sim.active) : new Set<string>()));
  const simEnabled = computed(() => (sim.on ? enabledTransitions(flat.value, new Set(sim.active)) : new Set<string>()));
  function simReset(): void { sim.active = [...initialMarking(activeG.value)]; }
  function simFire(tid: string): void { sim.active = [...fire(flat.value, new Set(sim.active), tid)]; announce(T('a_fired')); }
  function toggleSim(): void {
    sim.on = !sim.on;
    if (sim.on) { simReset(); announce(T('a_sim_on')); } else announce(T('a_sim_off'));
  }

  /* ----- données : vue, copie, import ----- */
  const dataText = computed(() => {
    if (dataView.value === 'native') return exportNative(projectRef.value).output;
    if (dataView.value === 'sfcedit') return exportSfcEditXml(projectRef.value).output;
    return JSON.stringify(dataView.value === 'json' ? activeG.value : flat.value, null, 1);
  });
  const copyMsg = reactive({ text: '', cls: '' });
  const importMsg = reactive({ text: '', cls: '' });
  const importText = ref('');
  /** Rapport de conversion du dernier import / de l'export en cours (lignes déjà localisées). */
  const importReport = ref<{ level: ReportEntry['level']; text: string }[]>([]);
  const toLines = (es: ReportEntry[]) => es.map((e) => ({ level: e.level, text: renderMessage(e.message) }));
  const exportReport = computed(() => (dataView.value === 'sfcedit' ? toLines(exportSfcEditXml(projectRef.value).report.entries) : []));
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
  function applyImport(fileName?: string): void {
    importReport.value = [];
    try {
      let next, activeId: string;
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
      let s1: string | null = null;
      walkAll(activeG.value.items, (it) => { if (!s1 && it.kind === 'step' && it.num === '1') s1 = it.id; });
      sel.value = s1 ?? viewStore.layout.focus[0]?.id ?? null;
      if (sel.value) { const id = sel.value; nextTick(() => viewStore.reveal(id)); }
    });
    document.fonts?.ready.then(() => viewStore.invalidateFonts());
    syncLegalFromHash();
    window.addEventListener('hashchange', syncLegalFromHash);
  }

  return {
    sel, tab, tabs, linkedNum, linkedIn, sharedNum, theme, themeLabel, dataView, sim, liveMsg, announce, insertWhere, whereNow, whereFixed,
    selBase, selLoc, selItem, isDivBar, selText, selShort, allowed, slotPos, activeRegion, jumpTargets, recFb, tokens,
    wrap, canWrap, unwrap, canUnwrap, moveBranch, canMoveBranch,
    insertKind, removeSel, setField, setAction, addAction, delAction, addToken, addBranch, delBranch, doRenumber,
    openG, addGrafcet, dupGrafcet, delGrafcet,
    pick, pickFromText, focusHost, onHostFocus, goIssue, onKey,
    simActive, simEnabled, simReset, simFire, toggleSim,
    dataText, importReport, exportReport, downloadSfcEdit, downloadArchive, canFolder, saveFolder, openFolder, copyMsg, importMsg, importText, copyData, downloadNative, applyImport, onFile,
    legalDoc, openLegal, closeLegal, syncLegalFromHash,
    cycleTheme, setLang, init,
  };
});
