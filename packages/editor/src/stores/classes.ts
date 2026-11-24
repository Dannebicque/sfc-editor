import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { T } from '../i18n';
import {
  api, ApiError, KNOWN_ERRORS,
  type AssignmentDetail, type ClassComment, type ClassDetail, type ClassSummary, type ImportResult,
} from '../api';
import { useAccountStore } from './account';
import { useUiStore } from './ui';

export interface ParsedStudents { students: Array<{ name: string; email: string }>; bad: number }

/**
 * Lit une liste collée depuis un tableur ou un fichier texte : une personne par ligne, « nom, email » (virgule, point-virgule ou tabulation, dans
 * un ordre ou dans l'autre). Une première ligne sans adresse (en-tête de colonnes) est ignorée ; les autres lignes sans adresse sont comptées comme erreurs.
 */
export function parseStudents(text: string): ParsedStudents {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const students: ParsedStudents['students'] = [];
  let bad = 0;
  lines.forEach((line, i) => {
    const parts = line.split(/[;\t,]/).map((p) => p.trim().replace(/^"|"$/g, '').trim()).filter(Boolean);
    const at = parts.findIndex((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p));
    if (at < 0) { if (i > 0 || lines.length === 1) bad++; return; }
    const name = parts.filter((_, j) => j !== at).join(' ').trim();
    if (!name) { bad++; return; }
    students.push({ name, email: parts[at]! });
  });
  return { students, bad };
}

export type ClassView = 'list' | 'class' | 'assignment';

/** Espaces de classe (ADR 0006) : liste des classes, une classe, un sujet et ses rendus. */
export const useClassesStore = defineStore('classes', () => {
  const account = useAccountStore();
  const ui = useUiStore();
  const teaching = ref<ClassSummary[]>([]);
  const enrolled = ref<ClassSummary[]>([]);
  const canTeach = ref(false);
  const view = ref<ClassView>('list');
  const cls = ref<ClassDetail | null>(null);
  const detail = ref<AssignmentDetail | null>(null);
  const comments = ref<{ userId: string; name: string; list: ClassComment[] } | null>(null);
  const importResult = ref<ImportResult[] | null>(null);
  const busy = ref(false);
  const error = ref('');
  const info = ref('');

  /** Le bouton « Classes » n'apparaît que pour qui est concerné·e (enseignant·e, élève, invité·e, ou compte pouvant créer une classe). */
  const visible = computed(() => !!account.user && (teaching.value.length > 0 || enrolled.value.length > 0 || canTeach.value || account.classInvitations.length > 0));

  const msg = (e: unknown): string => T('acc_err_' + (e instanceof ApiError && KNOWN_ERRORS.has(e.code) ? e.code : 'server'));
  async function run<R>(fn: () => Promise<R>): Promise<R | undefined> {
    busy.value = true; error.value = ''; info.value = '';
    try { return await fn(); } catch (e) { error.value = msg(e); return undefined; } finally { busy.value = false; }
  }
  const said = (key: string): void => { info.value = T(key); ui.announce(T(key)); };

  async function loadList(): Promise<void> {
    const r = await run(() => api<{ teaching: ClassSummary[]; enrolled: ClassSummary[]; canTeach: boolean }>('GET', '/api/classes'));
    if (r) { teaching.value = r.teaching; enrolled.value = r.enrolled; canTeach.value = r.canTeach; }
  }
  /** Silencieux : sert au bouton de l'en-tête, sans message d'erreur. */
  async function probe(): Promise<void> {
    try {
      const r = await api<{ teaching: ClassSummary[]; enrolled: ClassSummary[]; canTeach: boolean }>('GET', '/api/classes');
      teaching.value = r.teaching; enrolled.value = r.enrolled; canTeach.value = r.canTeach;
    } catch { teaching.value = []; enrolled.value = []; canTeach.value = false; }
  }
  watch(() => account.user?.id, (id) => { if (id) void probe(); else { teaching.value = []; enrolled.value = []; canTeach.value = false; reset(); } }, { immediate: true });

  watch(() => account.classInvitations.length, () => { if (account.user) void probe(); });

  function reset(): void { view.value = 'list'; cls.value = null; detail.value = null; comments.value = null; importResult.value = null; error.value = ''; info.value = ''; }

  async function backToList(): Promise<void> { reset(); await loadList(); }
  async function openClass(id: string): Promise<void> {
    const r = await run(() => api<ClassDetail>('GET', `/api/classes/${id}`));
    if (!r) return;
    cls.value = r; detail.value = null; comments.value = null; importResult.value = null; view.value = 'class';
  }
  async function reloadClass(): Promise<void> {
    if (!cls.value) return;
    const r = await run(() => api<ClassDetail>('GET', `/api/classes/${cls.value!.id}`));
    if (r) cls.value = r;
  }
  async function openAssignment(aid: string): Promise<void> {
    if (!cls.value) return;
    const r = await run(() => api<AssignmentDetail>('GET', `/api/classes/${cls.value!.id}/assignments/${aid}`));
    if (!r) return;
    detail.value = r; comments.value = null; view.value = 'assignment';
  }
  async function reloadAssignment(): Promise<void> {
    if (!cls.value || !detail.value) return;
    const r = await run(() => api<AssignmentDetail>('GET', `/api/classes/${cls.value!.id}/assignments/${detail.value!.assignment.id}`));
    if (r) detail.value = r;
  }
  const base = (): string => `/api/classes/${cls.value!.id}`;
  const abase = (): string => `${base()}/assignments/${detail.value!.assignment.id}`;

  async function createClass(name: string): Promise<boolean> {
    const r = await run(() => api<{ id: string }>('POST', '/api/classes', { name }));
    if (!r) return false;
    said('cls_a_created');
    await openClass(r.id);
    void probe();
    return true;
  }
  async function deleteClass(): Promise<void> {
    await run(() => api('DELETE', base()));
    if (!error.value) { await backToList(); void probe(); }
  }
  async function leaveClass(): Promise<void> {
    await run(() => api('DELETE', `${base()}/students/${account.user!.id}`));
    if (!error.value) { await backToList(); void probe(); }
  }
  async function importStudents(text: string): Promise<boolean> {
    const parsed = parseStudents(text);
    if (parsed.bad || !parsed.students.length) { error.value = parsed.bad ? T('cls_import_bad', { n: parsed.bad }) : T('acc_err_invalid_body'); return false; }
    const r = await run(() => api<{ results: ImportResult[] }>('POST', `${base()}/students`, { students: parsed.students }));
    if (!r) return false;
    importResult.value = r.results;
    ui.announce(T('cls_import_result'));
    await reloadClass();
    return true;
  }
  async function resend(userId: string): Promise<void> {
    await run(() => api('POST', `${base()}/students/${userId}/resend`, {}));
    if (!error.value) said('cls_resent');
  }
  async function removeStudent(userId: string): Promise<void> {
    await run(() => api('DELETE', `${base()}/students/${userId}`));
    if (!error.value) await reloadClass();
  }
  async function cancelInvite(id: string): Promise<void> {
    await run(() => api('DELETE', `${base()}/invites/${id}`));
    if (!error.value) await reloadClass();
  }
  async function createAssignment(a: { title: string; instructions: string; dueDate: string; projectId?: string; document?: unknown }): Promise<boolean> {
    const body: Record<string, unknown> = { title: a.title, instructions: a.instructions };
    if (a.dueDate) body.dueAt = new Date(a.dueDate + 'T23:59:00').toISOString();
    if (a.projectId) body.projectId = a.projectId; else body.document = a.document;
    const r = await run(() => api<{ id: string }>('POST', `${base()}/assignments`, body));
    if (!r) return false;
    said('cls_a_published');
    await reloadClass();
    return true;
  }
  async function deleteAssignment(): Promise<void> {
    await run(() => api('DELETE', abase()));
    if (!error.value) { detail.value = null; view.value = 'class'; await reloadClass(); }
  }
  async function submit(submitted: boolean): Promise<void> {
    await run(() => api('POST', `${abase()}/submit`, { submitted }));
    if (!error.value) { said(submitted ? 'cls_a_submitted' : 'cls_a_unsubmitted'); await reloadAssignment(); }
  }
  /** Donne à l'enseignant·e l'accès à la copie d'un·e élève ; renvoie l'identifiant du projet à ouvrir. */
  async function openCopy(userId: string, role: 'viewer' | 'editor'): Promise<string | null> {
    const r = await run(() => api<{ projectId: string }>('PUT', `${abase()}/submissions/${userId}/access`, { role }));
    return r?.projectId ?? null;
  }
  async function closeAccess(userId: string): Promise<void> {
    await run(() => api('DELETE', `${abase()}/submissions/${userId}/access`));
    if (!error.value) { said('cls_a_access'); await reloadAssignment(); }
  }
  async function loadComments(userId: string, name: string): Promise<void> {
    const r = await run(() => api<{ comments: ClassComment[] }>('GET', `${abase()}/submissions/${userId}/comments`));
    if (r) comments.value = { userId, name, list: r.comments };
  }
  async function addComment(body: string): Promise<boolean> {
    const c = comments.value; if (!c) return false;
    await run(() => api('POST', `${abase()}/submissions/${c.userId}/comments`, { body }));
    if (error.value) return false;
    said('cls_a_comment');
    await loadComments(c.userId, c.name); await reloadAssignment();
    return true;
  }
  async function deleteComment(id: string): Promise<void> {
    const c = comments.value; if (!c) return;
    await run(() => api('DELETE', `${abase()}/submissions/${c.userId}/comments/${id}`));
    if (!error.value) { await loadComments(c.userId, c.name); await reloadAssignment(); }
  }

  return {
    teaching, enrolled, canTeach, view, cls, detail, comments, importResult, busy, error, info, visible,
    loadList, probe, reset, backToList, openClass, openAssignment, createClass, deleteClass, leaveClass, importStudents, resend, removeStudent, cancelInvite,
    createAssignment, deleteAssignment, submit, openCopy, closeAccess, loadComments, addComment, deleteComment,
  };
});
