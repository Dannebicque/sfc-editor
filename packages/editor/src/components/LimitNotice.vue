<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { T } from '../i18n';
import { GUEST_LIMITS } from '../limits';
import { useUiStore } from '../stores/ui';
import { useAccountStore } from '../stores/account';
import { track } from '../usage';

const ui = useUiStore();
const account = useAccountStore();
const { limitHit } = storeToRefs(ui);
function signup(): void { track('limit_cta'); limitHit.value = null; account.open('auth', 'register'); }
</script>

<template>
  <div v-if="limitHit" class="limit-notice" role="alert">
    <p>{{ T('lim_' + limitHit, { n: GUEST_LIMITS[limitHit] }) }} {{ T('lim_cta_text') }}</p>
    <div class="row">
      <button class="btn solid on" type="button" @click="signup">{{ T('lim_cta') }}</button>
      <button class="btn solid" type="button" @click="limitHit = null">{{ T('lim_dismiss') }}</button>
    </div>
  </div>
</template>
