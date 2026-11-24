<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { T } from '../i18n';

const props = defineProps<{ open: boolean; title: string; id: string; cls?: string }>();
const emit = defineEmits<{ close: [] }>();
const dlg = ref<HTMLDialogElement | null>(null);

/** <dialog> natif : piège à focus, Échap et restauration du focus fournis par le navigateur. */
watch(() => props.open, async (v) => {
  await nextTick();
  const d = dlg.value;
  if (!d) return;
  if (v && !d.open) d.showModal();
  else if (!v && d.open) d.close();
}, { immediate: true, flush: 'post' });
function onBackdrop(e: MouseEvent): void { if (e.target === dlg.value) emit('close'); }
</script>

<template>
  <dialog ref="dlg" class="legal share acc" :class="cls" :aria-labelledby="id + '-title'" @close="emit('close')" @click="onBackdrop">
    <template v-if="open">
      <div class="legal-head">
        <h2 :id="id + '-title'">{{ title }}</h2>
        <button class="btn solid" type="button" @click="emit('close')">{{ T('legal_close') }}</button>
      </div>
      <div class="share-body"><slot /></div>
    </template>
  </dialog>
</template>
