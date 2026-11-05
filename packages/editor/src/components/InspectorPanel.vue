<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { T } from '../i18n';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import DataPanel from './DataPanel.vue';
import IssuesPanel from './IssuesPanel.vue';
import PropsPanel from './PropsPanel.vue';
import TextPanel from './TextPanel.vue';

const ui = useUiStore();
const { tab, tabs } = storeToRefs(ui);
const { issues, issueErr } = storeToRefs(useProjectStore());
</script>

<template>
  <aside class="side right" :aria-label="T('panels_aria')">
    <div class="tabs" role="tablist" :aria-label="T('panels_aria')">
      <button
        v-for="t in tabs" :id="'tab-' + t.id" :key="t.id" role="tab" class="tab"
        :aria-selected="tab === t.id" :aria-controls="'pan-' + t.id" @click="tab = t.id"
      >
        {{ t.label }}<span v-if="t.id === 'issues' && issues.length" class="badge" :class="issueErr ? 'err' : 'warn'" style="grid-row: auto; grid-column: auto">{{ issues.length }}</span>
      </button>
    </div>
    <PropsPanel v-show="tab === 'props'" />
    <IssuesPanel v-show="tab === 'issues'" />
    <TextPanel v-show="tab === 'text'" />
    <DataPanel v-show="tab === 'data'" />
  </aside>
</template>
