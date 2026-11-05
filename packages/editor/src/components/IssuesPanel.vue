<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { PROFILES, syncLinks } from '@grafcet/core';
import { issueText } from '../format';
import { T } from '../i18n';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import Icon from './Icon.vue';

const ui = useUiStore();
const projectStore = useProjectStore();
const { issues, profile } = storeToRefs(projectStore);
const nameOf = (id: string) => projectStore.project.grafcets.find((g) => g.id === id)?.name ?? '?';
/** Synchronisations : étapes testées dans un autre GRAFCET du projet. */
const syncs = computed(() => syncLinks(projectStore.project, projectStore.knownSteps));
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
    <section v-if="syncs.length" class="sync" aria-labelledby="sync-title">
      <h3 id="sync-title">{{ T('sync_title') }}</h3>
      <p class="hint">{{ T('sync_help') }}</p>
      <ul class="issues">
        <li v-for="(s, i) in syncs" :key="i">
          <button class="issue" @click="ui.openG(s.from, s.item)">
            <span class="sev" :class="s.in.length ? 'warning' : 'error'">{{ s.in.length ? T('sync_ok') : T('sync_unknown') }}</span>
            <span>{{ T('sync_line', { g: nameOf(s.from), n: s.num, d: s.in.length ? s.in.map(nameOf).join(', ') : '—' }) }}</span>
          </button>
        </li>
      </ul>
    </section>
    <div class="okbox"><Icon n="check" />{{ T('ok_box') }}</div>
    <p v-if="!issues.length" class="hint">{{ T('no_issue_more') }}</p>
    <ul v-else class="issues">
      <li v-for="(it, i) in issues" :key="i">
        <button class="issue" @click="ui.goIssue(it)"><span class="sev" :class="it.level">{{ it.level === 'error' ? T('sev_error') : T('sev_warn') }}</span><span>{{ issueText(it) }}</span></button>
      </li>
    </ul>
  </div>
</template>
