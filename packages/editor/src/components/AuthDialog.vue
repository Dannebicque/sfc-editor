<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { T } from '../i18n';
import { useAccountStore } from '../stores/account';
import ModalDialog from './ModalDialog.vue';

const account = useAccountStore();
const { panel, authMode: mode, busy, error, info } = storeToRefs(account);
const email = ref(''), name = ref(''), password = ref('');
watch(panel, () => { password.value = ''; });
watch(mode, () => { password.value = ''; });

async function submit(): Promise<void> {
  if (mode.value === 'login') await account.login(email.value, password.value);
  else if (mode.value === 'register') await account.register(email.value, name.value, password.value);
  else if (mode.value === 'forgot') await account.forgot(email.value);
  else if (mode.value === 'reset') await account.reset(password.value);
  password.value = '';
}
const go = (m: 'login' | 'register' | 'forgot'): void => account.open('auth', m);
</script>

<template>
  <ModalDialog id="auth" :open="panel === 'auth'" :title="T('acc_title_' + mode)" @close="account.close()">
    <p v-if="info" class="msg ok" role="status">{{ info }}</p>
    <p v-if="mode === 'verify' && busy" role="status">{{ T('acc_verifying') }}</p>
    <form v-if="mode !== 'verify'" class="acc-form" novalidate @submit.prevent="submit()">
      <template v-if="mode === 'register'">
        <label for="acc-name">{{ T('acc_name') }}</label>
        <input id="acc-name" v-model="name" type="text" autocomplete="name" required maxlength="80" :aria-describedby="error ? 'acc-err' : undefined" />
      </template>
      <template v-if="mode !== 'reset'">
        <label for="acc-email">{{ T('acc_email') }}</label>
        <input id="acc-email" v-model="email" type="email" autocomplete="email" required autofocus :aria-describedby="error ? 'acc-err' : undefined" />
      </template>
      <template v-if="mode !== 'forgot'">
        <label for="acc-pw">{{ mode === 'reset' ? T('acc_password_new') : T('acc_password') }}</label>
        <input id="acc-pw" v-model="password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" required
          :aria-describedby="(error ? 'acc-err ' : '') + (mode !== 'login' ? 'acc-pw-hint' : '')" />
        <p v-if="mode !== 'login'" id="acc-pw-hint" class="hint">{{ T('acc_password_hint') }}</p>
      </template>
      <p v-if="error" id="acc-err" class="msg err" role="alert">{{ error }}</p>
      <div class="row">
        <button class="btn solid on" type="submit" :disabled="busy">{{ busy ? T('acc_busy') : T('acc_btn_' + mode) }}</button>
      </div>
    </form>
    <p v-else-if="error" class="msg err" role="alert">{{ error }}</p>
    <div class="acc-links">
      <button v-if="mode === 'login'" class="linkbtn" type="button" @click="go('forgot')">{{ T('acc_link_forgot') }}</button>
      <button v-if="mode === 'login'" class="linkbtn" type="button" @click="go('register')">{{ T('acc_link_register') }}</button>
      <button v-else class="linkbtn" type="button" @click="go('login')">{{ T('acc_link_login') }}</button>
    </div>
    <p class="hint">{{ T('acc_local_note') }}</p>
  </ModalDialog>
</template>
