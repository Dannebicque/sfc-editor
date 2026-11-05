<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { macrosOf } from '@grafcet/core';
import { T } from '../i18n';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import Icon from './Icon.vue';

const project = useProjectStore();
const ui = useUiStore();
const { project: proj, activeId, sums } = storeToRefs(project);
const { linkedIn, linkedNum, citedIn } = storeToRefs(ui);
const cited = (gid: string) => citedIn.value.find((c) => c.gid === gid);
const parents = (gid: string) => proj.value.grafcets.flatMap((x) => macrosOf(x).filter((m) => m.expansion === gid).map((m) => ({ itemId: m.id, num: m.num })));
const shared = (gid: string) => linkedIn.value.some((l) => l.gid === gid);
const val = (e: Event) => (e.target as HTMLInputElement).value;
</script>

<template>
  <aside class="side left" :aria-label="T('project_aria')">
    <div class="side-h"><label class="sr" for="pname">{{ T('project_name') }}</label><input id="pname" class="pname" type="text" :value="proj.name" @input="project.renameProject(val($event))" /></div>
    <div class="side-title">GRAFCET <span>{{ proj.grafcets.length }}</span></div>
    <ul class="glist">
      <li v-for="g in proj.grafcets" :key="g.id">
        <button class="gitem" :class="{ on: g.id === activeId, linked: shared(g.id) || !!cited(g.id) }" :aria-current="g.id === activeId ? 'true' : undefined" @click="ui.openG(g.id)">
          <span class="gname">{{ g.name }}</span>
          <span v-for="p in parents(g.id)" :key="p.itemId" class="gmeta">{{ T('gmeta_expansion', { n: p.num }) }}</span>
          <span class="gmeta">{{ T('meta', { s: sums[g.id]!.steps, t: sums[g.id]!.trans }) }}</span>
          <span v-if="cited(g.id)" class="shared" :title="T('cite_title', { n: linkedNum! })">{{ T('cite_badge', { n: linkedNum!, c: cited(g.id)!.count }) }}</span>
          <span v-if="shared(g.id)" class="shared" :title="T('shared_title', { n: linkedNum! })">{{ T('shared_badge', { n: linkedNum! }) }}</span>
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
