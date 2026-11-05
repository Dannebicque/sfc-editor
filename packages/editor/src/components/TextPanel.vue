<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { T } from '../i18n';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import OutlineList from './OutlineList.vue';

const ui = useUiStore();
const { activeG } = storeToRefs(useProjectStore());
const { sel } = storeToRefs(ui);
</script>

<template>
  <div id="pan-text" class="panel" role="tabpanel" aria-labelledby="tab-text">
    <h2>{{ T('text_title') }}</h2>
    <p class="hint">{{ T('text_hint') }}</p>
    <OutlineList :sel="sel" :g="activeG" @pick="ui.pickFromText" />
  </div>
</template>
