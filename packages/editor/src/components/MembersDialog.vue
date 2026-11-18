<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { T } from '../i18n';
import { useAccountStore } from '../stores/account';
import { useCollabStore } from '../stores/collab';
import ModalDialog from './ModalDialog.vue';

const account = useAccountStore();
const collab = useCollabStore();
const { panel, members, user, busy, error, info } = storeToRefs(account);
const email = ref(''), role = ref<'editor' | 'viewer'>('editor');
watch(panel, (p) => { if (p === 'members' && collab.current) { email.value = ''; void account.loadMembers(collab.current.id); } });
const pid = (): string => collab.current!.id;
const isOwner = (): boolean => members.value?.role === 'owner';

async function leave(): Promise<void> {
  if (!user.value || !confirm(T('acc_leave_confirm'))) return;
  await account.removeMember(pid(), user.value.id);
  if (!error.value) { collab.close(false); account.close(); void account.loadProjects(); }
}
async function invite(): Promise<void> { await account.invite(pid(), email.value, role.value); if (!error.value) email.value = ''; }
const onRole = (uid: string, e: Event): Promise<void> => account.setRole(pid(), uid, (e.target as HTMLSelectElement).value as 'editor' | 'viewer');
</script>

<template>
  <ModalDialog id="members" :open="panel === 'members' && !!collab.current" :title="T('acc_members_title', { x: collab.current?.name ?? '' })" @close="account.close()">
    <template v-if="collab.current && members">
      <p v-if="info" class="msg ok" role="status">{{ info }}</p>
      <p v-if="error" class="msg err" role="alert">{{ error }}</p>
      <section aria-labelledby="mem-h">
        <h3 id="mem-h" class="acc-h">{{ T('acc_members') }}</h3>
        <ul class="acc-list">
          <li v-for="m in members.members" :key="m.userId">
            <span class="acc-main"><strong>{{ m.name }}</strong><span v-if="m.userId === user?.id" class="hint">{{ T('acc_you') }}</span><span v-if="m.email" class="hint">{{ m.email }}</span></span>
            <span class="row">
              <template v-if="isOwner() && m.role !== 'owner'">
                <label class="sr" :for="'role-' + m.userId">{{ T('acc_role_label', { x: m.name }) }}</label>
                <select :id="'role-' + m.userId" :value="m.role" :disabled="busy" @change="onRole(m.userId, $event)">
                  <option value="editor">{{ T('acc_role_editor') }}</option>
                  <option value="viewer">{{ T('acc_role_viewer') }}</option>
                </select>
                <button class="btn solid" type="button" :disabled="busy" @click="account.transfer(pid(), m.userId)">{{ T('acc_make_owner') }}</button>
                <button class="btn solid danger" type="button" :disabled="busy" @click="account.removeMember(pid(), m.userId)">{{ T('acc_remove') }}</button>
              </template>
              <span v-else>{{ T('acc_role_' + m.role) }}</span>
            </span>
          </li>
        </ul>
      </section>
      <section v-if="isOwner()" aria-labelledby="inv-new-h">
        <h3 id="inv-new-h" class="acc-h">{{ T('acc_invite_title') }}</h3>
        <form class="acc-form" @submit.prevent="invite()">
          <label for="inv-email">{{ T('acc_email') }}</label>
          <input id="inv-email" v-model="email" type="email" autocomplete="off" required />
          <label for="inv-role">{{ T('acc_role') }}</label>
          <select id="inv-role" v-model="role">
            <option value="editor">{{ T('acc_role_editor') }}</option>
            <option value="viewer">{{ T('acc_role_viewer') }}</option>
          </select>
          <p class="hint">{{ T('acc_invite_hint') }}</p>
          <div class="row"><button class="btn solid on" type="submit" :disabled="busy">{{ T('acc_invite_btn') }}</button></div>
        </form>
      </section>
      <section v-if="members.invites.length" aria-labelledby="pend-h">
        <h3 id="pend-h" class="acc-h">{{ T('acc_pending') }}</h3>
        <ul class="acc-list">
          <li v-for="i in members.invites" :key="i.id">
            <span class="acc-main"><strong>{{ i.email }}</strong><span class="hint">{{ T('acc_role_' + i.role) }}</span></span>
            <button class="btn solid" type="button" :disabled="busy" @click="account.cancelInvite(pid(), i.id)">{{ T('acc_cancel_invite') }}</button>
          </li>
        </ul>
      </section>
      <div v-if="!isOwner()" class="row"><button class="btn solid danger" type="button" :disabled="busy" @click="leave()">{{ T('acc_leave') }}</button></div>
    </template>
  </ModalDialog>
</template>
