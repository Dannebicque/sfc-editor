<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { exportNative } from '@grafcet/io';
import { T } from '../i18n';
import { useAccountStore } from '../stores/account';
import { useClassesStore } from '../stores/classes';
import { useCollabStore } from '../stores/collab';
import { useProjectStore } from '../stores/project';
import ModalDialog from './ModalDialog.vue';

const account = useAccountStore();
const classes = useClassesStore();
const collab = useCollabStore();
const project = useProjectStore();
const { panel, projects } = storeToRefs(account);
const { teaching, enrolled, view, cls, detail, comments, importResult, busy, error, info } = storeToRefs(classes);

const newName = ref(''), list = ref('');
const aTitle = ref(''), aInstr = ref(''), aDue = ref(''), aSrc = ref('current');
const comment = ref('');
const heading = ref<HTMLElement | null>(null);

watch(panel, (p) => {
  if (p === 'classes') { classes.reset(); void classes.loadList(); void account.loadProjects(); newName.value = list.value = aTitle.value = aInstr.value = aDue.value = comment.value = ''; aSrc.value = 'current'; }
});
/** Quand la vue change (liste → classe → sujet), le focus passe au titre : le lecteur d'écran annonce où l'on est. */
watch([view, () => cls.value?.id, () => detail.value?.assignment.id], async () => { await nextTick(); heading.value?.focus(); });

const fmt = (iso: string): string => new Date(iso).toLocaleDateString();
const fmtTime = (iso: string): string => new Date(iso).toLocaleString();
const ownedProjects = (): typeof projects.value => projects.value.filter((p) => p.role === 'owner');

async function openProject(id: string | null): Promise<void> { if (!id) return; account.close(); await collab.open(id); }

async function create(): Promise<void> { if (await classes.createClass(newName.value)) newName.value = ''; }
async function addStudents(): Promise<void> { if (await classes.importStudents(list.value)) list.value = ''; }
async function publish(): Promise<void> {
  const ok = await classes.createAssignment({
    title: aTitle.value, instructions: aInstr.value, dueDate: aDue.value,
    ...(aSrc.value === 'current' ? { document: JSON.parse(exportNative(project.project).output) } : { projectId: aSrc.value }),
  });
  if (ok) { aTitle.value = aInstr.value = aDue.value = ''; aSrc.value = 'current'; }
}
async function removeStudent(id: string, name: string): Promise<void> { if (confirm(T('cls_remove_confirm', { x: name }))) await classes.removeStudent(id); }
async function delClass(): Promise<void> { if (cls.value && confirm(T('cls_delete_class_confirm', { x: cls.value.name }))) await classes.deleteClass(); }
async function leave(): Promise<void> { if (cls.value && confirm(T('cls_leave_confirm', { x: cls.value.name }))) await classes.leaveClass(); }
async function delAssignment(): Promise<void> { if (detail.value && confirm(T('cls_delete_assign_confirm', { x: detail.value.assignment.title }))) await classes.deleteAssignment(); }
async function openCopy(userId: string, role: 'viewer' | 'editor'): Promise<void> { await openProject(await classes.openCopy(userId, role)); }
async function postComment(): Promise<void> { if (await classes.addComment(comment.value)) comment.value = ''; }
async function answer(id: string, accept: boolean): Promise<void> { await account.answerClassInvitation(id, accept); await classes.loadList(); void classes.probe(); }
</script>

<template>
  <ModalDialog id="classes" :open="panel === 'classes'" :title="T('cls_title')" @close="account.close()">
    <p v-if="error" class="msg err" role="alert">{{ error }}</p>
    <p v-if="info" class="msg ok" role="status">{{ info }}</p>

    <!-- ───────── liste des classes ───────── -->
    <template v-if="view === 'list'">
      <section v-if="account.classInvitations.length" aria-labelledby="cls-inv-h">
        <h3 id="cls-inv-h" class="acc-h">{{ T('cls_invitations') }}</h3>
        <ul class="acc-list">
          <li v-for="i in account.classInvitations" :key="i.id">
            <span>{{ T('cls_invite_line', { x: i.invitedBy, e: i.class }) }}</span>
            <span class="row">
              <button class="btn solid on" type="button" :disabled="busy" @click="answer(i.id, true)">{{ T('acc_accept') }}</button>
              <button class="btn solid" type="button" :disabled="busy" @click="answer(i.id, false)">{{ T('acc_decline') }}</button>
            </span>
          </li>
        </ul>
      </section>
      <section aria-labelledby="cls-teach-h">
        <h3 id="cls-teach-h" ref="heading" class="acc-h" tabindex="-1">{{ T('cls_teaching') }}</h3>
        <p v-if="!teaching.length" class="hint">{{ T('cls_none') }}</p>
        <ul v-else class="acc-list">
          <li v-for="c in teaching" :key="c.id">
            <span class="acc-main"><strong>{{ c.name }}</strong><span class="hint">{{ T('cls_n_students', { n: c.students ?? 0 }) }} · {{ T('cls_n_assign', { n: c.assignments ?? 0 }) }}</span></span>
            <button class="btn solid on" type="button" :disabled="busy" @click="classes.openClass(c.id)">{{ T('cls_open') }}<span class="sr"> {{ c.name }}</span></button>
          </li>
        </ul>
      </section>
      <section v-if="classes.canTeach" aria-labelledby="cls-new-h">
        <h3 id="cls-new-h" class="acc-h">{{ T('cls_new_title') }}</h3>
        <form class="acc-form" @submit.prevent="create()">
          <label for="cls-new-name">{{ T('cls_new_name') }}</label>
          <input id="cls-new-name" v-model="newName" type="text" required maxlength="120" aria-describedby="cls-new-hint" autocomplete="off" />
          <p id="cls-new-hint" class="hint">{{ T('cls_new_hint') }}</p>
          <div class="row"><button class="btn solid on" type="submit" :disabled="busy">{{ T('cls_new_btn') }}</button></div>
        </form>
      </section>
      <section v-if="enrolled.length" aria-labelledby="cls-enr-h">
        <h3 id="cls-enr-h" class="acc-h">{{ T('cls_enrolled') }}</h3>
        <ul class="acc-list">
          <li v-for="c in enrolled" :key="c.id">
            <span class="acc-main"><strong>{{ c.name }}</strong><span class="hint">{{ T('cls_by_teacher', { x: c.teacher ?? '' }) }}</span></span>
            <button class="btn solid on" type="button" :disabled="busy" @click="classes.openClass(c.id)">{{ T('cls_open') }}<span class="sr"> {{ c.name }}</span></button>
          </li>
        </ul>
      </section>
    </template>

    <!-- ───────── une classe ───────── -->
    <template v-else-if="view === 'class' && cls">
      <p><button class="btn solid" type="button" @click="classes.backToList()">{{ T('cls_back_list') }}</button></p>
      <h3 ref="heading" class="cls-title" tabindex="-1">{{ cls.name }}</h3>
      <p v-if="cls.role === 'student'" class="hint">{{ T('cls_by_teacher', { x: cls.teacher ?? '' }) }}</p>

      <section aria-labelledby="cls-as-h">
        <h4 id="cls-as-h" class="acc-h">{{ T('cls_assignments') }}</h4>
        <p v-if="!cls.assignments.length" class="hint">{{ T('cls_assign_empty') }}</p>
        <ul v-else class="acc-list">
          <li v-for="a in cls.assignments" :key="a.id">
            <span class="acc-main">
              <strong>{{ a.title }}</strong>
              <span v-if="cls.role === 'teacher'" class="hint">{{ T('cls_progress', { s: a.submitted ?? 0, t: a.students ?? 0 }) }}<template v-if="a.dueAt"> · {{ T('cls_due', { d: fmt(a.dueAt) }) }}</template></span>
              <span v-else class="hint">
                {{ a.submission?.status === 'submitted' && a.submission.submittedAt ? T('cls_status_submitted', { d: fmt(a.submission.submittedAt) }) : T('cls_status_todo') }}<template v-if="a.dueAt"> · {{ T('cls_due', { d: fmt(a.dueAt) }) }}</template><template v-if="a.submission?.comments"> · {{ T('cls_comments_n', { n: a.submission.comments }) }}</template>
              </span>
            </span>
            <button class="btn solid on" type="button" :disabled="busy" @click="classes.openAssignment(a.id)">{{ T('cls_open') }}<span class="sr"> {{ a.title }}</span></button>
          </li>
        </ul>
      </section>

      <template v-if="cls.role === 'teacher'">
        <section aria-labelledby="cls-new-as-h">
          <h4 id="cls-new-as-h" class="acc-h">{{ T('cls_assign_new_title') }}</h4>
          <form class="acc-form" @submit.prevent="publish()">
            <label for="as-title">{{ T('cls_assign_title') }}</label>
            <input id="as-title" v-model="aTitle" type="text" required maxlength="120" autocomplete="off" />
            <label for="as-instr">{{ T('cls_assign_instr') }}</label>
            <textarea id="as-instr" v-model="aInstr" rows="3" maxlength="4000"></textarea>
            <label for="as-due">{{ T('cls_assign_due') }}</label>
            <input id="as-due" v-model="aDue" type="date" />
            <label for="as-src">{{ T('cls_assign_src') }}</label>
            <select id="as-src" v-model="aSrc" aria-describedby="as-src-hint">
              <option value="current">{{ T('cls_src_current') }}</option>
              <option v-for="p in ownedProjects()" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <p id="as-src-hint" class="hint">{{ T('cls_assign_hint') }}</p>
            <div class="row"><button class="btn solid on" type="submit" :disabled="busy">{{ T('cls_assign_btn') }}</button></div>
          </form>
        </section>

        <section aria-labelledby="cls-st-h">
          <h4 id="cls-st-h" class="acc-h">{{ T('cls_students') }}</h4>
          <p v-if="!cls.students?.length" class="hint">{{ T('cls_students_empty') }}</p>
          <ul v-else class="acc-list">
            <li v-for="s in cls.students" :key="s.userId">
              <span class="acc-main"><strong>{{ s.name }}</strong><span class="hint">{{ s.email }} · {{ s.activated ? T('cls_activated') : T('cls_pending') }}</span></span>
              <span class="row">
                <button v-if="!s.activated" class="btn solid" type="button" :disabled="busy" @click="classes.resend(s.userId)">{{ T('cls_resend') }}<span class="sr"> {{ s.name }}</span></button>
                <button class="btn solid danger" type="button" :disabled="busy" @click="removeStudent(s.userId, s.name)">{{ T('cls_remove_student') }}<span class="sr"> {{ s.name }}</span></button>
              </span>
            </li>
          </ul>
          <template v-if="cls.invites?.length">
            <h5 class="acc-h">{{ T('cls_invites') }}</h5>
            <ul class="acc-list">
              <li v-for="i in cls.invites" :key="i.id">
                <span>{{ i.email }}</span>
                <button class="btn solid" type="button" :disabled="busy" @click="classes.cancelInvite(i.id)">{{ T('cls_cancel_invite') }}<span class="sr"> {{ i.email }}</span></button>
              </li>
            </ul>
          </template>
        </section>

        <section aria-labelledby="cls-imp-h">
          <h4 id="cls-imp-h" class="acc-h">{{ T('cls_import_title') }}</h4>
          <form class="acc-form" @submit.prevent="addStudents()">
            <label for="imp-list">{{ T('cls_import_label') }}</label>
            <textarea id="imp-list" v-model="list" rows="6" required aria-describedby="imp-hint imp-minors" spellcheck="false" placeholder="Léa Martin, lea.martin@exemple.fr"></textarea>
            <p id="imp-hint" class="hint">{{ T('cls_import_hint') }}</p>
            <p id="imp-minors" class="hint">{{ T('cls_import_minors') }}</p>
            <div class="row"><button class="btn solid on" type="submit" :disabled="busy">{{ T('cls_import_btn') }}</button></div>
          </form>
          <div v-if="importResult" role="status">
            <h5 class="acc-h">{{ T('cls_import_result') }}</h5>
            <ul class="acc-list">
              <li v-for="r in importResult" :key="r.email"><span>{{ r.email }}</span><span class="hint">{{ T('cls_st_' + r.status) }}</span></li>
            </ul>
          </div>
        </section>
        <div class="row"><button class="btn solid danger" type="button" :disabled="busy" @click="delClass()">{{ T('cls_delete_class') }}</button></div>
      </template>
      <div v-else class="row"><button class="btn solid danger" type="button" :disabled="busy" @click="leave()">{{ T('cls_leave') }}</button></div>
    </template>

    <!-- ───────── un sujet ───────── -->
    <template v-else-if="view === 'assignment' && cls && detail">
      <p><button class="btn solid" type="button" @click="classes.openClass(cls.id)">{{ T('cls_back_class', { x: cls.name }) }}</button></p>
      <h3 ref="heading" class="cls-title" tabindex="-1">{{ detail.assignment.title }}</h3>
      <p v-if="detail.assignment.dueAt" class="hint">{{ T('cls_due', { d: fmt(detail.assignment.dueAt) }) }}</p>
      <section v-if="detail.assignment.instructions" aria-labelledby="as-ins-h">
        <h4 id="as-ins-h" class="acc-h">{{ T('cls_instructions') }}</h4>
        <p class="cls-text">{{ detail.assignment.instructions }}</p>
      </section>

      <!-- vue enseignant·e -->
      <template v-if="cls.role === 'teacher' && detail.submissions">
        <section aria-labelledby="as-sub-h">
          <h4 id="as-sub-h" class="acc-h">{{ T('cls_submissions') }} — {{ T('cls_progress', { s: detail.assignment.submitted ?? 0, t: detail.assignment.students ?? 0 }) }}</h4>
          <div class="cls-scroll">
            <table class="cls-table">
              <caption class="sr">{{ T('cls_submissions_caption', { x: detail.assignment.title }) }}</caption>
              <thead><tr><th scope="col">{{ T('cls_col_student') }}</th><th scope="col">{{ T('cls_col_status') }}</th><th scope="col">{{ T('cls_col_updated') }}</th><th scope="col">{{ T('cls_col_actions') }}</th></tr></thead>
              <tbody>
                <tr v-for="s in detail.submissions" :key="s.userId">
                  <th scope="row">{{ s.name }}</th>
                  <td>{{ s.status === 'submitted' && s.submittedAt ? T('cls_status_submitted', { d: fmt(s.submittedAt) }) : T('cls_status_todo') }}<br v-if="s.access" /><span v-if="s.access" class="hint">{{ T('cls_access_' + s.access) }}</span></td>
                  <td>{{ fmtTime(s.updatedAt) }}</td>
                  <td>
                    <span class="row">
                      <button class="btn solid" type="button" :disabled="busy" @click="openCopy(s.userId, 'viewer')">{{ T('cls_open_ro') }}<span class="sr"> — {{ s.name }}</span></button>
                      <button class="btn solid" type="button" :disabled="busy" @click="openCopy(s.userId, 'editor')">{{ T('cls_open_edit') }}<span class="sr"> — {{ s.name }}</span></button>
                      <button v-if="s.access" class="btn solid" type="button" :disabled="busy" @click="classes.closeAccess(s.userId)">{{ T('cls_close_access') }}<span class="sr"> — {{ s.name }}</span></button>
                      <button class="btn solid" type="button" :disabled="busy" @click="classes.loadComments(s.userId, s.name)">{{ T('cls_comment_show') }} ({{ s.comments }})<span class="sr"> — {{ s.name }}</span></button>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section v-if="comments" aria-labelledby="cm-h">
          <h4 id="cm-h" class="acc-h">{{ T('cls_comment_title', { x: comments.name }) }}</h4>
          <p v-if="!comments.list.length" class="hint">{{ T('cls_comments_empty') }}</p>
          <ul v-else class="acc-list">
            <li v-for="c in comments.list" :key="c.id">
              <span class="acc-main"><span class="cls-text">{{ c.body }}</span><span class="hint">{{ T('cls_comment_by', { x: c.author, d: fmtTime(c.createdAt) }) }}</span></span>
              <button class="btn solid" type="button" :disabled="busy" @click="classes.deleteComment(c.id)">{{ T('cls_comment_delete') }}</button>
            </li>
          </ul>
          <form class="acc-form" @submit.prevent="postComment()">
            <label for="cm-new">{{ T('cls_comment_label') }}</label>
            <textarea id="cm-new" v-model="comment" rows="3" required maxlength="2000"></textarea>
            <div class="row"><button class="btn solid on" type="submit" :disabled="busy">{{ T('cls_comment_btn') }}</button></div>
          </form>
        </section>
        <div class="row"><button class="btn solid danger" type="button" :disabled="busy" @click="delAssignment()">{{ T('cls_delete_assign') }}</button></div>
      </template>

      <!-- vue élève -->
      <template v-else-if="detail.submission">
        <section aria-labelledby="my-h">
          <h4 id="my-h" class="acc-h">{{ T('cls_my_copy') }}</h4>
          <p class="hint">{{ detail.submission.status === 'submitted' && detail.submission.submittedAt ? T('cls_status_submitted', { d: fmt(detail.submission.submittedAt) }) : T('cls_status_todo') }}</p>
          <div class="row">
            <button class="btn solid on" type="button" :disabled="busy" @click="openProject(detail.submission.projectId)">{{ T('cls_open_copy') }}</button>
            <button v-if="detail.submission.status === 'todo'" class="btn solid" type="button" :disabled="busy" @click="classes.submit(true)">{{ T('cls_submit') }}</button>
            <button v-else class="btn solid" type="button" :disabled="busy" @click="classes.submit(false)">{{ T('cls_unsubmit') }}</button>
          </div>
        </section>
        <section aria-labelledby="my-cm-h">
          <h4 id="my-cm-h" class="acc-h">{{ T('cls_teacher_comments') }}</h4>
          <p v-if="!detail.comments?.length" class="hint">{{ T('cls_comments_empty') }}</p>
          <ul v-else class="acc-list">
            <li v-for="c in detail.comments" :key="c.id"><span class="acc-main"><span class="cls-text">{{ c.body }}</span><span class="hint">{{ T('cls_comment_by', { x: c.author, d: fmtTime(c.createdAt) }) }}</span></span></li>
          </ul>
        </section>
      </template>
    </template>
  </ModalDialog>
</template>
