<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { issueText } from '../format';
import { T } from '../i18n';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import Icon from './Icon.vue';

const ui = useUiStore();
const { issues } = storeToRefs(useProjectStore());
</script>

<template>
  <div id="pan-issues" class="panel" role="tabpanel" aria-labelledby="tab-issues">
    <h2>{{ T('issues_title') }}</h2>
    <div class="okbox"><Icon n="check" />{{ T('ok_box') }}</div>
    <p v-if="!issues.length" class="hint">{{ T('no_issue_more') }}</p>
    <ul v-else class="issues">
      <li v-for="(it, i) in issues" :key="i">
        <button class="issue" @click="ui.goIssue(it)"><span class="sev" :class="it.level">{{ it.level === 'error' ? T('sev_error') : T('sev_warn') }}</span><span>{{ issueText(it) }}</span></button>
      </li>
    </ul>
  </div>
</template>
