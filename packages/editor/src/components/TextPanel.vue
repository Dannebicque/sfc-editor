<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { sequencesOf } from '@grafcet/core';
import { T } from '../i18n';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import OutlineList from './OutlineList.vue';

const ui = useUiStore();
const { activeG } = storeToRefs(useProjectStore());
const { sel } = storeToRefs(ui);
const sequences = computed(() => sequencesOf(activeG.value));
</script>

<template>
  <div id="pan-text" class="panel" role="tabpanel" aria-labelledby="tab-text">
    <h2>{{ T('text_title') }}</h2>
    <p class="hint">{{ T('text_hint') }}</p>
    <template v-for="(s, k) in sequences" :key="k">
      <h3 v-if="sequences.length > 1">{{ T('text_seq', { i: k + 1 }) }}</h3>
      <OutlineList :items="s" :sel="sel" :g="activeG" @pick="ui.pickFromText" />
    </template>
  </div>
</template>
