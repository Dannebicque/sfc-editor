<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { T } from '../i18n';
import { useAccountStore } from '../stores/account';
import ModalDialog from './ModalDialog.vue';

const account = useAccountStore();
const { panel, user, busy, error, info } = storeToRefs(account);
const name = ref(''), cur = ref(''), next = ref(''), delPw = ref(''), confirmDelete = ref(false);
watch(panel, (p) => { if (p === 'account') { name.value = user.value?.name ?? ''; cur.value = next.value = delPw.value = ''; confirmDelete.value = false; } });

async function changePw(): Promise<void> { if (await account.changePassword(cur.value, next.value)) cur.value = next.value = ''; }
</script>

<template>
  <ModalDialog id="account" :open="panel === 'account' && !!user" :title="T('acc_account_title')" @close="account.close()">
    <template v-if="user">
      <p v-if="info" class="msg ok" role="status">{{ info }}</p>
      <p v-if="error" class="msg err" role="alert">{{ error }}</p>
      <section aria-labelledby="acc-prof">
        <h3 id="acc-prof" class="acc-h">{{ T('acc_profile') }}</h3>
        <form class="acc-form" @submit.prevent="account.saveProfile(name)">
          <label for="acc-pname">{{ T('acc_name') }}</label>
          <input id="acc-pname" v-model="name" type="text" autocomplete="name" required maxlength="80" />
          <p class="hint">{{ user.email }} — {{ user.emailVerified ? T('acc_email_verified') : T('acc_email_unverified') }}</p>
          <div class="row">
            <button class="btn solid on" type="submit" :disabled="busy">{{ T('acc_save') }}</button>
            <button v-if="!user.emailVerified" class="btn solid" type="button" :disabled="busy" @click="account.resendVerification()">{{ T('acc_resend') }}</button>
          </div>
        </form>
      </section>
      <section aria-labelledby="acc-pw-h">
        <h3 id="acc-pw-h" class="acc-h">{{ T('acc_change_password') }}</h3>
        <form class="acc-form" @submit.prevent="changePw()">
          <label for="acc-cur">{{ T('acc_password_cur') }}</label>
          <input id="acc-cur" v-model="cur" type="password" autocomplete="current-password" required />
          <label for="acc-new">{{ T('acc_password_new') }}</label>
          <input id="acc-new" v-model="next" type="password" autocomplete="new-password" required aria-describedby="acc-new-hint" />
          <p id="acc-new-hint" class="hint">{{ T('acc_password_hint') }}</p>
          <div class="row"><button class="btn solid" type="submit" :disabled="busy">{{ T('acc_change_password') }}</button></div>
        </form>
      </section>
      <section aria-labelledby="acc-data">
        <h3 id="acc-data" class="acc-h">{{ T('acc_data') }}</h3>
        <p class="hint">{{ T('acc_export_hint') }}</p>
        <div class="row"><button class="btn solid" type="button" :disabled="busy" @click="account.exportData()">{{ T('acc_export_data') }}</button></div>
        <p class="hint">{{ T('acc_delete_hint') }}</p>
        <div v-if="!confirmDelete" class="row"><button class="btn solid danger" type="button" @click="confirmDelete = true">{{ T('acc_delete') }}</button></div>
        <form v-else class="acc-form" @submit.prevent="account.deleteAccount(delPw)">
          <label for="acc-del">{{ T('acc_delete_confirm_pw') }}</label>
          <input id="acc-del" v-model="delPw" type="password" autocomplete="current-password" required autofocus />
          <div class="row">
            <button class="btn solid danger" type="submit" :disabled="busy">{{ T('acc_delete_final') }}</button>
            <button class="btn solid" type="button" @click="confirmDelete = false">{{ T('share_cancel') }}</button>
          </div>
        </form>
      </section>
      <div class="row"><button class="btn solid" type="button" @click="account.logout()">{{ T('acc_logout') }}</button></div>
    </template>
  </ModalDialog>
</template>
