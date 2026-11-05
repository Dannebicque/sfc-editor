<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { T, lang } from '../i18n';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import { useViewStore } from '../stores/view';
import Icon from './Icon.vue';

const project = useProjectStore();
const ui = useUiStore();
const view = useViewStore();
const { past, future } = storeToRefs(project);
const { sim, theme, themeLabel } = storeToRefs(ui);
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="logo" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="1.5" width="6" height="4" /><path d="M8 5.5v2.2M5.8 7.7h4.4M8 7.7v1.6" /><rect x="5" y="9.3" width="6" height="4" /></svg></span>
      <h1>{{ T('app_title') }}</h1><span class="tag">{{ T('proto') }}</span>
    </div>
    <div class="tools" role="toolbar" :aria-label="T('hist_label')">
      <button class="btn icon" :disabled="!past.length" :title="T('undo_t')" @click="project.undo()"><Icon n="undo" /><span class="sr">{{ T('undo') }}</span></button>
      <button class="btn icon" :disabled="!future.length" :title="T('redo_t')" @click="project.redo()"><Icon n="redo" /><span class="sr">{{ T('redo') }}</span></button>
    </div>
    <div class="tools" role="toolbar" :aria-label="T('view_label')">
      <button class="btn icon" :title="T('zoom_out_t')" @click="view.zoomBy(1 / 1.2)"><Icon n="zout" /><span class="sr">{{ T('zoom_out') }}</span></button>
      <span class="zlevel" aria-live="off">{{ Math.round(view.view.z * 100) }} %</span>
      <button class="btn icon" :title="T('zoom_in_t')" @click="view.zoomBy(1.2)"><Icon n="zin" /><span class="sr">{{ T('zoom_in') }}</span></button>
      <button class="btn icon" :title="T('fit_t')" @click="view.fit(true)"><Icon n="fit" /><span class="sr">{{ T('fit') }}</span></button>
    </div>
    <div class="spacer"></div>
    <button class="btn solid" :class="{ on: sim.on }" :aria-pressed="sim.on" @click="ui.toggleSim()"><Icon :n="sim.on ? 'stop' : 'play'" /><span class="txt">{{ sim.on ? T('sim_stop') : T('sim') }}</span></button>
    <div class="seg langseg" role="group" :aria-label="T('lang_label')">
      <button type="button" lang="fr" title="Français" :aria-pressed="lang === 'fr'" @click="ui.setLang('fr')">FR</button>
      <button type="button" lang="en" title="English" :aria-pressed="lang === 'en'" @click="ui.setLang('en')">EN</button>
    </div>
    <button class="btn icon" :title="T('theme', { v: themeLabel })" @click="ui.cycleTheme()"><Icon :n="theme === 'auto' ? 'auto' : theme === 'dark' ? 'moon' : 'sun'" /><span class="sr">{{ T('theme', { v: themeLabel }) }}</span></button>
  </header>
</template>
