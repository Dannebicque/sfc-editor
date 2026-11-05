<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { T } from '../i18n';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';

const ui = useUiStore();
const { selText } = storeToRefs(ui);
const { stats, issues, issueErr } = storeToRefs(useProjectStore());
</script>

<template>
  <footer class="status">
    <span class="grow"><b>{{ selText || T('none_selected') }}</b></span>
    <span>{{ T('n_steps', { n: stats.steps }) }} · {{ T('n_trans', { n: stats.trans }) }}</span>
    <span v-if="issueErr" style="color: var(--err)">{{ T('n_errors', { n: issueErr }) }}</span>
    <span v-else-if="issues.length" style="color: var(--warn)">{{ T('n_warnings', { n: issues.length }) }}</span>
    <span v-else style="color: var(--ok)">{{ T('no_problem') }}</span>
    <button type="button" class="linklike" @click="ui.openLegal('mentions')">{{ T('legal_link') }}</button>
  </footer>
</template>
