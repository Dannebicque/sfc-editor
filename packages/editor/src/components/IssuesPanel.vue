<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { PROFILES } from '@grafcet/core';
import { issueText } from '../format';
import { T } from '../i18n';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import Icon from './Icon.vue';

const ui = useUiStore();
const projectStore = useProjectStore();
const { issues, profile } = storeToRefs(projectStore);
</script>

<template>
  <div id="pan-issues" class="panel" role="tabpanel" aria-labelledby="tab-issues">
    <h2>{{ T('issues_title') }}</h2>
    <div class="field">
      <label for="profile">{{ T('profile_label') }}</label>
      <select id="profile" :value="profile" aria-describedby="profile-help" @change="projectStore.setProfile(($event.target as HTMLSelectElement).value as typeof PROFILES[number])">
        <option v-for="p in PROFILES" :key="p" :value="p">{{ T('profile_' + p) }}</option>
      </select>
      <p id="profile-help" class="hint">{{ T('profile_help_' + profile) }}</p>
    </div>
    <div class="okbox"><Icon n="check" />{{ T('ok_box') }}</div>
    <p v-if="!issues.length" class="hint">{{ T('no_issue_more') }}</p>
    <ul v-else class="issues">
      <li v-for="(it, i) in issues" :key="i">
        <button class="issue" @click="ui.goIssue(it)"><span class="sev" :class="it.level">{{ it.level === 'error' ? T('sev_error') : T('sev_warn') }}</span><span>{{ issueText(it) }}</span></button>
      </li>
    </ul>
  </div>
</template>
