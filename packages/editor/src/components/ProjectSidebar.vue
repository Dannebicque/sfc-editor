<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { T } from '../i18n';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import Icon from './Icon.vue';

const project = useProjectStore();
const ui = useUiStore();
const { project: proj, activeId, sums } = storeToRefs(project);
const val = (e: Event) => (e.target as HTMLInputElement).value;
</script>

<template>
  <aside class="side left" :aria-label="T('project_aria')">
    <div class="side-h"><label class="sr" for="pname">{{ T('project_name') }}</label><input id="pname" class="pname" type="text" :value="proj.name" @input="project.renameProject(val($event))" /></div>
    <div class="side-title">GRAFCET <span>{{ proj.grafcets.length }}</span></div>
    <ul class="glist">
      <li v-for="g in proj.grafcets" :key="g.id">
        <button class="gitem" :class="{ on: g.id === activeId }" :aria-current="g.id === activeId ? 'true' : undefined" @click="ui.openG(g.id)">
          <span class="gname">{{ g.name }}</span>
          <span class="gmeta">{{ T('meta', { s: sums[g.id]!.steps, t: sums[g.id]!.trans }) }}</span>
          <span v-if="sums[g.id]!.err" class="badge err" :title="T('n_errors', { n: sums[g.id]!.err })">{{ T('badge_err', { n: sums[g.id]!.err }) }}</span>
          <span v-else-if="sums[g.id]!.warn" class="badge warn" :title="T('n_warnings', { n: sums[g.id]!.warn })">{{ T('badge_warn', { n: sums[g.id]!.warn }) }}</span>
          <span v-else class="badge ok">OK</span>
        </button>
      </li>
    </ul>
    <div class="side-actions">
      <button class="btn solid" @click="ui.addGrafcet()"><Icon n="plus" />{{ T('add') }}</button>
      <button class="btn solid" @click="ui.dupGrafcet()"><Icon n="copy" />{{ T('dup') }}</button>
      <button class="btn solid danger" :disabled="proj.grafcets.length < 2" @click="ui.delGrafcet()"><Icon n="trash" />{{ T('del') }}</button>
    </div>
    <p class="side-note">{{ T('side_note') }}</p>
  </aside>
</template>
