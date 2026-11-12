import { ref } from 'vue';
import { defineStore, storeToRefs } from 'pinia';
import { exportNative, importNative } from '@grafcet/io';
import { T } from '../i18n';
import { createShare, deleteShare, fetchShare, idFromHash, loadEntries, saveEntries, shareBase, ShareError, type ShareEntry } from '../share';
import { useProjectStore } from './project';
import { useUiStore } from './ui';

export type ShareDialog =
  | { kind: 'publish'; step: 'confirm' | 'busy' | 'done'; id?: string; token?: string; expiresAt?: string; error?: string }
  | { kind: 'open'; id: string; step: 'loading' | 'ready' | 'busy'; name?: string; count?: number; error?: string };

/** Partage par lien (ADR 0004) : publier le projet, ouvrir une copie depuis un lien, supprimer ses partages. Inactif sans `VITE_SHARE_URL`. */
export const useShareStore = defineStore('share', () => {
  const project = useProjectStore();
  const ui = useUiStore();
  const { project: projectRef } = storeToRefs(project);
  const base = shareBase();
  const enabled = base !== null;
  const dialog = ref<ShareDialog | null>(null);
  const entries = ref<ShareEntry[]>(enabled ? loadEntries() : []);
  const errText = (e: unknown): string => T('share_err_' + (e instanceof ShareError ? e.code : 'server'));

  function openPublish(): void { if (enabled) dialog.value = { kind: 'publish', step: 'confirm' }; }

  async function publish(): Promise<void> {
    const d = dialog.value;
    if (!base || !d || d.kind !== 'publish' || d.step === 'busy') return;
    dialog.value = { kind: 'publish', step: 'busy' };
    try {
      const r = await createShare(base, exportNative(projectRef.value).output);
      entries.value = [{ id: r.id, token: r.deleteToken, expiresAt: r.expiresAt, name: projectRef.value.name }, ...entries.value];
      saveEntries(entries.value);
      dialog.value = { kind: 'publish', step: 'done', id: r.id, token: r.deleteToken, expiresAt: r.expiresAt };
      ui.announce(T('share_published'));
    } catch (e) { dialog.value = { kind: 'publish', step: 'confirm', error: errText(e) }; }
  }

  async function remove(id: string): Promise<void> {
    const e = entries.value.find((x) => x.id === id);
    if (!base || !e) return;
    try { await deleteShare(base, id, e.token); } catch (err) {
      // Déjà supprimé ou expiré : on l'oublie simplement ; toute autre erreur est signalée.
      if (!(err instanceof ShareError && err.code === 'not_found')) { ui.announce(errText(err)); return; }
    }
    entries.value = entries.value.filter((x) => x.id !== id);
    saveEntries(entries.value);
    ui.announce(T('share_deleted'));
  }

  /** Ouvre le dialogue « copie » quand l'adresse contient #/s/<id>. */
  async function syncFromHash(): Promise<void> {
    const id = idFromHash(location.hash);
    if (!enabled || !base || !id) return;
    dialog.value = { kind: 'open', id, step: 'loading' };
    try {
      const text = await fetchShare(base, id);
      const p = importNative(text).model;
      if (!dialog.value || dialog.value.kind !== 'open' || dialog.value.id !== id) return;
      pendingText = text;
      dialog.value = { kind: 'open', id, step: 'ready', name: p.name, count: p.grafcets.length };
    } catch (e) {
      dialog.value = { kind: 'open', id, step: 'loading', error: e instanceof ShareError ? errText(e) : T('share_err_invalid') };
    }
  }
  let pendingText = '';

  /** Remplace le projet par la copie (annulable : l'historique est conservé). */
  function confirmOpen(): void {
    const d = dialog.value;
    if (!d || d.kind !== 'open' || d.step !== 'ready') return;
    const p = importNative(pendingText).model;
    project.replaceProject(p);
    ui.openG(p.grafcets[0]!.id);
    ui.announce(T('share_opened'));
    close();
  }

  function close(): void {
    const wasOpen = dialog.value?.kind === 'open';
    dialog.value = null;
    pendingText = '';
    if (wasOpen && idFromHash(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  }

  function init(): void {
    if (!enabled) return;
    void syncFromHash();
    window.addEventListener('hashchange', () => { void syncFromHash(); });
  }

  return { enabled, dialog, entries, openPublish, publish, remove, confirmOpen, close, init };
});
