<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { T } from '../i18n';
import { shareLink } from '../share';
import { useShareStore } from '../stores/share';

const share = useShareStore();
const { dialog } = storeToRefs(share);
const dlg = ref<HTMLDialogElement | null>(null);
const copied = ref(false);
const link = computed(() => (dialog.value?.kind === 'publish' && dialog.value.id ? shareLink(dialog.value.id) : ''));
const fmt = (iso?: string): string => (iso ? new Date(iso).toLocaleDateString() : '');

/** <dialog> natif : piège à focus, Échap et restauration du focus fournis par le navigateur. */
watch(() => !!dialog.value, async (v) => {
  await nextTick();
  const d = dlg.value;
  if (!d) return;
  if (v && !d.open) d.showModal();
  else if (!v && d.open) d.close();
  copied.value = false;
}, { immediate: true, flush: 'post' });

async function copy(): Promise<void> {
  try { await navigator.clipboard.writeText(link.value); copied.value = true; } catch { copied.value = false; }
}
function onBackdrop(e: MouseEvent): void { if (e.target === dlg.value) share.close(); }
</script>

<template>
  <dialog ref="dlg" class="legal share" :aria-labelledby="'share-title'" @close="share.close()" @click="onBackdrop">
    <template v-if="dialog">
      <div class="legal-head">
        <h2 id="share-title">{{ dialog.kind === 'publish' ? T('share_title') : T('share_open_title') }}</h2>
        <button class="btn solid" type="button" @click="share.close()">{{ T('legal_close') }}</button>
      </div>
      <div class="share-body">
        <template v-if="dialog.kind === 'publish'">
          <template v-if="dialog.step !== 'done'">
            <p>{{ T('share_what') }}</p>
            <ul>
              <li>{{ T('share_what_1') }}</li>
              <li>{{ T('share_what_2') }}</li>
              <li>{{ T('share_what_3') }}</li>
            </ul>
            <p v-if="dialog.error" class="msg err" role="alert">{{ dialog.error }}</p>
            <div class="row">
              <button class="btn solid on" type="button" :disabled="dialog.step === 'busy'" @click="share.publish()">{{ dialog.step === 'busy' ? T('share_busy') : T('share_publish') }}</button>
              <button class="btn solid" type="button" @click="share.close()">{{ T('share_cancel') }}</button>
            </div>
          </template>
          <template v-else>
            <p><strong>{{ T('share_done') }}</strong> {{ T('share_expires', { d: fmt(dialog.expiresAt) }) }}</p>
            <label for="share-link">{{ T('share_link') }}</label>
            <div class="row">
              <input id="share-link" class="share-link" type="text" readonly :value="link" @focus="($event.target as HTMLInputElement).select()" />
              <button class="btn solid" type="button" @click="copy()">{{ copied ? T('copied') : T('copy') }}</button>
            </div>
            <p class="hint">{{ T('share_delete_hint') }}</p>
            <div class="row"><button class="btn solid" type="button" @click="share.close()">{{ T('legal_close') }}</button></div>
          </template>
        </template>
        <template v-else>
          <p v-if="dialog.error" class="msg err" role="alert">{{ dialog.error }}</p>
          <p v-else-if="dialog.step === 'loading'" role="status">{{ T('share_loading') }}</p>
          <template v-else>
            <p>{{ T('share_open_what', { name: dialog.name ?? '', n: dialog.count ?? 0 }) }}</p>
            <p class="hint">{{ T('share_open_hint') }}</p>
            <div class="row">
              <button class="btn solid on" type="button" @click="share.confirmOpen()">{{ T('share_open_btn') }}</button>
              <button class="btn solid" type="button" @click="share.close()">{{ T('share_cancel') }}</button>
            </div>
          </template>
          <div v-if="dialog.error" class="row"><button class="btn solid" type="button" @click="share.close()">{{ T('legal_close') }}</button></div>
        </template>
      </div>
    </template>
  </dialog>
</template>
