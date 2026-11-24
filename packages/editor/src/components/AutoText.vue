<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

/**
 * Champ de saisie d'une équation ou d'un libellé : une zone de texte qui grandit avec son contenu (jamais tronquée).
 * Le texte reste « sur une seule ligne logique » : Entrée n'insère pas de saut de ligne et les sauts collés sont remplacés
 * par des espaces. Les attributs (id, class, placeholder, aria-*, data-*) passent à la zone de texte.
 */
const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const el = ref<HTMLTextAreaElement | null>(null);
let ro: ResizeObserver | null = null;

function fit(): void {
  const t = el.value;
  if (!t) return;
  t.style.height = 'auto';
  t.style.height = t.scrollHeight + 2 + 'px';
}
function onInput(e: Event): void {
  const t = e.target as HTMLTextAreaElement;
  const clean = t.value.replace(/[\r\n]+/g, ' ');
  if (clean !== t.value) { const p = t.selectionStart; t.value = clean; t.setSelectionRange(p, p); }
  emit('update:modelValue', clean);
  fit();
}
onMounted(() => {
  fit();
  if (typeof ResizeObserver !== 'undefined' && el.value) { ro = new ResizeObserver(() => fit()); ro.observe(el.value); }
});
onBeforeUnmount(() => ro?.disconnect());
watch(() => props.modelValue, () => nextTick(fit));
</script>

<template>
  <textarea ref="el" class="autotext" rows="1" wrap="soft" :value="modelValue" @input="onInput" @keydown.enter.prevent />
</template>
