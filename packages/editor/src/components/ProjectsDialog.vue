<script setup lang="ts">
import { watch } from 'vue';
import { storeToRefs } from 'pinia';
import { T } from '../i18n';
import { useAccountStore } from '../stores/account';
import { useCollabStore } from '../stores/collab';
import ModalDialog from './ModalDialog.vue';

const account = useAccountStore();
const collab = useCollabStore();
const { panel, projects, invitations, busy, error, info, user } = storeToRefs(account);
watch(panel, (p) => { if (p === 'projects') void account.loadProjects(); });
const fmt = (iso: string): string => new Date(iso).toLocaleString();

async function open(id: string): Promise<void> { account.close(); await collab.open(id); }
async function saveCurrent(): Promise<void> {
  const id = await account.saveCurrent();
  if (id) { account.close(); await collab.open(id); }
}
async function remove(id: string, name: string): Promise<void> {
  if (confirm(T('acc_projects_delete_confirm', { x: name }))) await account.deleteProject(id);
}
async function answer(id: string, accept: boolean): Promise<void> { await account.answerInvitation(id, accept); }
</script>

<template>
  <ModalDialog id="projects" :open="panel === 'projects'" :title="T('acc_projects_title')" @close="account.close()">
    <p v-if="error" class="msg err" role="alert">{{ error }}</p>
    <p v-if="info" class="msg ok" role="status">{{ info }}</p>
    <div v-if="user && !user.emailVerified" class="msg warn" role="status">
      <p>{{ T('acc_verify_to_accept') }}</p>
      <button class="btn solid" type="button" :disabled="busy" @click="account.resendVerification()">{{ T('acc_resend') }}</button>
    </div>
    <section v-if="account.classInvitations.length" aria-labelledby="cinv-h">
      <h3 id="cinv-h" class="acc-h">{{ T('cls_invitations') }}</h3>
      <ul class="acc-list">
        <li v-for="i in account.classInvitations" :key="i.id">
          <span>{{ T('cls_invite_line', { x: i.invitedBy, e: i.class }) }}</span>
          <span class="row">
            <button class="btn solid on" type="button" :disabled="busy" @click="account.answerClassInvitation(i.id, true)">{{ T('acc_accept') }}</button>
            <button class="btn solid" type="button" :disabled="busy" @click="account.answerClassInvitation(i.id, false)">{{ T('acc_decline') }}</button>
          </span>
        </li>
      </ul>
    </section>
    <section v-if="invitations.length" aria-labelledby="inv-h">
      <h3 id="inv-h" class="acc-h">{{ T('acc_invitations') }}</h3>
      <ul class="acc-list">
        <li v-for="i in invitations" :key="i.id">
          <span>{{ T('acc_invite_line', { x: i.invitedBy, e: i.project, v: T('acc_role_' + i.role) }) }}</span>
          <span class="row">
            <button class="btn solid on" type="button" :disabled="busy" @click="answer(i.id, true)">{{ T('acc_accept') }}</button>
            <button class="btn solid" type="button" :disabled="busy" @click="answer(i.id, false)">{{ T('acc_decline') }}</button>
          </span>
        </li>
      </ul>
    </section>
    <section aria-labelledby="proj-h">
      <h3 id="proj-h" class="acc-h">{{ T('acc_projects') }}</h3>
      <p v-if="!projects.length" class="hint">{{ T('acc_projects_empty') }}</p>
      <ul v-else class="acc-list">
        <li v-for="p in projects" :key="p.id">
          <span class="acc-main">
            <strong>{{ p.name }}</strong>
            <span class="hint">{{ T('acc_role_' + p.role) }} · {{ T('acc_by', { x: p.owner }) }} · {{ T('acc_updated', { d: fmt(p.updatedAt) }) }}</span>
          </span>
          <span class="row">
            <button class="btn solid on" type="button" @click="open(p.id)">{{ T('acc_projects_open') }}</button>
            <button v-if="p.role === 'owner'" class="btn solid danger" type="button" :disabled="busy" @click="remove(p.id, p.name)">{{ T('acc_projects_delete') }}</button>
          </span>
        </li>
      </ul>
    </section>
    <section v-if="!collab.current" aria-labelledby="save-h">
      <h3 id="save-h" class="acc-h">{{ T('acc_save_current_title') }}</h3>
      <p class="hint">{{ T('acc_save_current_hint') }}</p>
      <div class="row"><button class="btn solid" type="button" :disabled="busy" @click="saveCurrent()">{{ T('acc_save_current') }}</button></div>
    </section>
  </ModalDialog>
</template>
