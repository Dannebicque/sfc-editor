import { computed, ref, shallowRef, watch } from 'vue';
import { defineStore, storeToRefs } from 'pinia';
import { LOCAL_ORIGIN, readProject, writeProject } from '@grafcet/collab';
import { T } from '../i18n';
import { api, ApiError, KNOWN_ERRORS, wsUrl, type Member } from '../api';
import { CollabProvider, type EndReason, type LinkStatus } from '../collab/provider';
import { useAccountStore } from './account';
import { useProjectStore } from './project';
import { useUiStore } from './ui';

export interface Peer { clientId: number; userId: string; name: string; role: string; editing: string | null; color: string }
export type Link = LinkStatus | 'idle';

/** Couleurs de présence ; l'identité reste lisible sans couleur (initiales et nom). Contraste ≥ 4,5:1 avec du texte blanc. */
const COLORS = ['#b3261e', '#1b6a3a', '#0b57d0', '#8a4b00', '#6b2fb3', '#00696b', '#9c2c77', '#5c5f00'];
export const colorOf = (id: string): string => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]!; };
export const initials = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]!.toUpperCase()).join('') || '?';

/** Co-édition (ADR 0005) : ouvre un projet en ligne, le garde synchronisé avec le serveur et expose la présence des autres. */
export const useCollabStore = defineStore('collab', () => {
  const project = useProjectStore();
  const ui = useUiStore();
  const account = useAccountStore();
  const { project: projectRef, activeId } = storeToRefs(project);

  const current = ref<{ id: string; name: string; role: 'owner' | 'editor' | 'viewer' } | null>(null);
  const link = ref<Link>('idle');
  const peers = ref<Peer[]>([]);
  const opening = ref(false);
  const provider = shallowRef<CollabProvider | null>(null);
  let stops: Array<() => void> = [];

  /** Autres personnes (une entrée par personne, même avec plusieurs onglets). */
  const others = computed(() => {
    const seen = new Map<string, Peer>();
    for (const p of peers.value) if (!seen.has(p.userId)) seen.set(p.userId, p);
    return [...seen.values()];
  });
  /** GRAFCET → noms des personnes qui l'éditent en ce moment. */
  const editors = computed(() => {
    const m: Record<string, string[]> = {};
    for (const p of others.value) if (p.editing && p.role !== 'viewer') (m[p.editing] ??= []).push(p.name);
    return m;
  });
  /** Personnes qui éditent le même GRAFCET que moi : le dernier enregistré gagne, on le signale. */
  const conflict = computed(() => editors.value[activeId.value] ?? []);

  function teardown(): void {
    for (const s of stops) s();
    stops = [];
    provider.value?.destroy();
    provider.value = null;
    peers.value = [];
  }

  function close(announce = true): void {
    if (!current.value && !provider.value) return;
    teardown();
    opening.value = false;
    project.leaveOnline();
    current.value = null;
    link.value = 'idle';
    if (location.hash.startsWith('#/p/')) history.replaceState(null, '', location.pathname + location.search);
    if (announce) ui.announce(T('collab_left'));
  }

  function end(why: EndReason, id: string): void {
    if (why === 'reload') { ui.announce(T('collab_reload')); opening.value = false; void open(id); return; }
    close(false);
    ui.announce(T(why === 'denied' ? 'collab_denied' : 'collab_gone'));
    void account.loadProjects();
  }

  async function open(id: string): Promise<void> {
    if (!account.user || opening.value) return;
    opening.value = true;
    let me: { role: string; members: Member[] };
    try { me = await api('GET', `/api/projects/${id}/members`); } catch (e) {
      opening.value = false;
      ui.announce(T('acc_err_' + (e instanceof ApiError && KNOWN_ERRORS.has(e.code) ? e.code : 'server')));
      return;
    }
    teardown();
    link.value = 'connecting';
    const role = me.role as 'owner' | 'editor' | 'viewer';
    let first = true;
    const p: CollabProvider = new CollabProvider(wsUrl(id), {
      status: (s) => { link.value = s; if (!first) ui.announce(T(s === 'synced' ? 'collab_back' : s === 'offline' ? 'collab_lost' : 'collab_connecting')); },
      ended: (why) => end(why, id),
      synced: () => {
        if (!first) return;
        first = false;
        opening.value = false;
        const readonly = p.role === 'viewer';
        project.enterOnline(readProject(p.doc), readonly);
        current.value = { id, name: project.project.name, role };
        history.replaceState(null, '', `${location.pathname}${location.search}#/p/${id}`);
        ui.announce(T(readonly ? 'collab_opened_ro' : 'collab_opened', { name: project.project.name }));
        bind(p);
      },
    });
    provider.value = p;
    // Garde-fou : si la connexion n'aboutit pas, on ne reste pas « en cours d'ouverture ».
    const t = setTimeout(() => { if (first) { opening.value = false; teardown(); link.value = 'idle'; ui.announce(T('acc_err_network')); } }, 15_000);
    stops.push(() => clearTimeout(t));
  }

  /** Branche le projet affiché sur le document partagé, dans les deux sens, et publie la présence. */
  function bind(p: CollabProvider): void {
    const onRemote = (_u: Uint8Array, origin: unknown): void => {
      if (origin === LOCAL_ORIGIN) return;
      project.applyRemote(readProject(p.doc));
      if (current.value) current.value.name = project.project.name;
    };
    p.doc.on('update', onRemote);
    stops.push(() => p.doc.off('update', onRemote));

    // Local → document : seulement si l'on a le droit d'écrire (le serveur le refuserait de toute façon).
    stops.push(watch(projectRef, (next) => { if (!project.readOnly) writeProject(p.doc, next); }));

    const aw = p.awareness;
    const publish = (): void => aw.setLocalState({ editing: activeId.value, color: colorOf(account.user?.id ?? '') });
    publish();
    stops.push(watch(activeId, publish));

    const known = new Set<string>();
    const refresh = (): void => {
      const list: Peer[] = [];
      aw.getStates().forEach((s, clientId) => {
        const st = s as { user?: { id: string; name: string; role: string }; editing?: string | null };
        if (clientId === p.doc.clientID || !st.user) return;
        list.push({ clientId, userId: st.user.id, name: st.user.name, role: st.user.role, editing: typeof st.editing === 'string' ? st.editing : null, color: colorOf(st.user.id) });
      });
      const names = new Map(list.map((x) => [x.userId, x.name]));
      for (const [id, name] of names) if (!known.has(id)) { known.add(id); ui.announce(T('collab_joined', { name })); }
      for (const id of [...known]) if (!names.has(id)) { known.delete(id); ui.announce(T('collab_peer_left')); }
      peers.value = list;
    };
    aw.on('change', refresh);
    stops.push(() => aw.off('change', refresh));
    refresh();
  }

  return { current, link, peers, others, editors, conflict, opening, open, close };
});
