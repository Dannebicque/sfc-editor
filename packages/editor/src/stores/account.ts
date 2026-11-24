import { computed, ref, watchEffect } from 'vue';
import { defineStore } from 'pinia';
import { exportNative } from '@grafcet/io';
import { clearAll } from '../collab/offline';
import { T, lang } from '../i18n';
import { GUEST_LIMITS } from '../limits';
import { track } from '../usage';
import {
  accountsEnabled, api, ApiError, KNOWN_ERRORS, parseHash,
  type ClassInvitation, type Invitation, type Member, type PendingInvite, type ProjectSummary, type UserInfo,
} from '../api';
import { useProjectStore } from './project';
import { useUiStore } from './ui';

export type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'verify';
export type Panel = 'auth' | 'projects' | 'account' | 'members' | 'classes' | null;

/** Comptes et projets en ligne (ADR 0005). Inactif sans `VITE_ACCOUNTS=1` : l'éditeur reste alors strictement local. */
export const useAccountStore = defineStore('account', () => {
  const ui = useUiStore();
  const project = useProjectStore();
  const enabled = accountsEnabled;
  const user = ref<UserInfo | null>(null);
  /** `loading` tant que la session n'a pas été vérifiée (évite de proposer « Se connecter » à quelqu'un déjà connecté). */
  const ready = ref(!enabled);
  const panel = ref<Panel>(null);
  const authMode = ref<AuthMode>('login');
  const token = ref('');
  const busy = ref(false);
  const error = ref('');
  const info = ref('');
  const projects = ref<ProjectSummary[]>([]);
  const invitations = ref<Invitation[]>([]);
  const classInvitations = ref<ClassInvitation[]>([]);
  const members = ref<{ role: string; members: Member[]; invites: PendingInvite[] } | null>(null);
  const signedIn = computed(() => !!user.value);
  /** Essai sans compte : avec les comptes activés, personne de connecté et projet local. Une instance sans comptes reste sans limite. */
  const guest = computed(() => enabled && !user.value && !project.online);
  watchEffect(() => { project.limits = guest.value ? GUEST_LIMITS : null; });
  /** Action à reprendre après connexion (ex. enregistrer le projet). */
  let afterLogin: (() => void) | null = null;

  const msg = (e: unknown): string => T('acc_err_' + (e instanceof ApiError && KNOWN_ERRORS.has(e.code) ? e.code : 'server'));
  async function run<R>(fn: () => Promise<R>): Promise<R | undefined> {
    busy.value = true; error.value = ''; info.value = '';
    try { return await fn(); } catch (e) {
      error.value = msg(e);
      if (e instanceof ApiError && e.status === 401 && user.value) { user.value = null; ui.announce(T('acc_session_over')); }
      return undefined;
    } finally { busy.value = false; }
  }

  function open(p: Exclude<Panel, null>, mode?: AuthMode): void {
    error.value = ''; info.value = '';
    if (mode) authMode.value = mode;
    panel.value = p;
  }
  const close = (): void => { panel.value = null; error.value = ''; info.value = ''; token.value = ''; afterLogin = null; };

  /** Ouvre la connexion ; `then` est exécuté une fois connecté. */
  function requireLogin(then: () => void): void {
    if (user.value) { then(); return; }
    afterLogin = then;
    open('auth', 'login');
  }

  async function refresh(): Promise<void> {
    try {
      const r = await api<{ user: UserInfo; invitations: Invitation[]; classInvitations?: ClassInvitation[] }>('GET', '/api/me');
      user.value = r.user; invitations.value = r.invitations; classInvitations.value = r.classInvitations ?? [];
    } catch { user.value = null; invitations.value = []; classInvitations.value = []; }
  }

  async function login(email: string, password: string): Promise<void> {
    const r = await run(() => api<{ user: UserInfo }>('POST', '/api/auth/login', { email, password }));
    if (!r) return;
    user.value = r.user;
    await refresh();
    ui.announce(T('acc_signed_in', { name: r.user.name }));
    const next = afterLogin; afterLogin = null;
    panel.value = null;
    if (next) next(); else if (invitations.value.length) open('projects');
  }

  async function register(email: string, name: string, password: string): Promise<void> {
    const r = await run(() => api('POST', '/api/auth/register', { email, name, password, locale: lang.value }));
    if (r !== undefined || !error.value) { info.value = T('acc_register_sent'); authMode.value = 'login'; }
  }
  async function forgot(email: string): Promise<void> {
    await run(() => api('POST', '/api/auth/forgot', { email }));
    if (!error.value) info.value = T('acc_forgot_sent');
  }
  async function reset(password: string): Promise<void> {
    await run(() => api('POST', '/api/auth/reset', { token: token.value, password }));
    if (!error.value) { token.value = ''; authMode.value = 'login'; info.value = T('acc_reset_done'); }
  }
  async function verify(): Promise<void> {
    await run(() => api('POST', '/api/auth/verify', { token: token.value }));
    if (!error.value) { info.value = T('acc_verified'); token.value = ''; await refresh(); }
  }
  async function resendVerification(): Promise<void> {
    await run(() => api('POST', '/api/auth/resend', {}));
    if (!error.value) info.value = T('acc_verify_resent');
  }
  async function logout(): Promise<void> {
    try { await api('POST', '/api/auth/logout', {}); } catch { /* la session expirera de toute façon */ }
    user.value = null; projects.value = []; invitations.value = []; classInvitations.value = [];
    void clearAll();
    panel.value = null;
    ui.announce(T('acc_signed_out'));
  }

  async function saveProfile(name: string): Promise<void> {
    const r = await run(() => api<{ user: UserInfo }>('PATCH', '/api/me', { name }));
    if (r) { user.value = r.user; info.value = T('acc_saved'); }
  }
  async function changePassword(current: string, next: string): Promise<boolean> {
    await run(() => api('POST', '/api/me/password', { current, next }));
    if (!error.value) { info.value = T('acc_password_changed'); return true; }
    return false;
  }
  async function exportData(): Promise<void> {
    const r = await run(() => api<unknown>('GET', '/api/me/export'));
    if (!r) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'mes-donnees-grafcet.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function deleteAccount(password: string): Promise<void> {
    await run(() => api('DELETE', '/api/me', { password }));
    if (!error.value) { user.value = null; projects.value = []; void clearAll(); panel.value = null; ui.announce(T('acc_deleted')); }
  }

  async function loadProjects(): Promise<void> {
    const r = await run(() => api<{ projects: ProjectSummary[] }>('GET', '/api/projects'));
    if (r) projects.value = r.projects;
    await refresh();
  }
  /** Enregistre le projet affiché dans le compte (copie en ligne). Renvoie l'identifiant du nouveau projet. */
  async function saveCurrent(): Promise<string | null> {
    const r = await run(() => api<{ id: string }>('POST', '/api/projects', exportNative(project.project).output));
    if (!r) return null;
    ui.announce(T('acc_project_saved'));
    await loadProjects();
    return r.id;
  }
  async function deleteProject(id: string): Promise<void> {
    await run(() => api('DELETE', '/api/projects/' + id));
    if (!error.value) { projects.value = projects.value.filter((p) => p.id !== id); ui.announce(T('acc_project_deleted')); }
  }
  async function answerClassInvitation(id: string, accept: boolean): Promise<void> {
    await run(() => (accept ? api('POST', `/api/class-invitations/${id}`, {}) : api('DELETE', `/api/class-invitations/${id}`)));
    if (!error.value) await refresh();
  }
  async function answerInvitation(id: string, accept: boolean): Promise<void> {
    await run(() => (accept ? api('POST', `/api/invitations/${id}`, {}) : api('DELETE', `/api/invitations/${id}`)));
    if (!error.value) await loadProjects();
  }

  async function loadMembers(projectId: string): Promise<void> {
    const r = await run(() => api<{ role: string; members: Member[]; invites: PendingInvite[] }>('GET', `/api/projects/${projectId}/members`));
    if (r) members.value = r;
  }
  async function invite(projectId: string, email: string, role: 'editor' | 'viewer'): Promise<void> {
    await run(() => api('POST', `/api/projects/${projectId}/invites`, { email, role }));
    if (!error.value) { info.value = T('acc_invited'); await loadMembers(projectId); }
  }
  async function setRole(projectId: string, userId: string, role: 'editor' | 'viewer'): Promise<void> {
    await run(() => api('PUT', `/api/projects/${projectId}/members/${userId}`, { role }));
    if (!error.value) await loadMembers(projectId);
  }
  async function removeMember(projectId: string, userId: string): Promise<void> {
    await run(() => api('DELETE', `/api/projects/${projectId}/members/${userId}`));
    if (!error.value) await loadMembers(projectId);
  }
  async function cancelInvite(projectId: string, inviteId: string): Promise<void> {
    await run(() => api('DELETE', `/api/projects/${projectId}/invites/${inviteId}`));
    if (!error.value) await loadMembers(projectId);
  }
  async function transfer(projectId: string, userId: string): Promise<void> {
    await run(() => api('POST', `/api/projects/${projectId}/transfer`, { userId }));
    if (!error.value) await loadMembers(projectId);
  }

  /** Routes du fragment : vérification d'email, réinitialisation, invitations, ouverture d'un projet. */
  function routeFromHash(openProject: (id: string) => void): void {
    const r = parseHash(location.hash);
    if (!r) return;
    const clear = (): void => history.replaceState(null, '', location.pathname + location.search);
    if (r.kind === 'verify') { token.value = r.token; clear(); open('auth', 'verify'); void verify(); }
    else if (r.kind === 'reset') { token.value = r.token; clear(); open('auth', 'reset'); }
    else if (r.kind === 'forgot') { clear(); open('auth', 'forgot'); }
    else if (r.kind === 'register') { clear(); if (!user.value) open('auth', 'register'); }
    else if (r.kind === 'invitations') { clear(); requireLogin(() => { open('projects'); void loadProjects(); }); }
    else if (r.kind === 'project') requireLogin(() => openProject(r.id));
  }

  async function init(openProject: (id: string) => void): Promise<void> {
    if (!enabled) return;
    await refresh();
    ready.value = true;
    // Un chargement de l'éditeur sans compte = une « session d'essai » (compteur anonyme, rien n'est stocké dans le navigateur ; voir usage.ts).
    if (!user.value) track('guest_session');
    routeFromHash(openProject);
    window.addEventListener('hashchange', () => routeFromHash(openProject));
  }

  return {
    enabled, user, ready, signedIn, guest, panel, authMode, token, busy, error, info, projects, invitations, classInvitations, members,
    open, close, requireLogin, init, refresh, login, register, forgot, reset, verify, resendVerification, logout, saveProfile, changePassword,
    exportData, deleteAccount, loadProjects, saveCurrent, deleteProject, answerInvitation, answerClassInvitation, loadMembers, invite, setRole, removeMember, cancelInvite, transfer,
  };
});
