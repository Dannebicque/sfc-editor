<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { T, keys as K } from '../i18n';
import { useUiStore } from '../stores/ui';
import { useViewStore } from '../stores/view';
import { computed } from 'vue';
import Icon from './Icon.vue';
import InsertBar from './InsertBar.vue';

const ui = useUiStore();
const view = useViewStore();
const { host } = storeToRefs(view);
const { shapes, layout, gTransform, gridStyle } = storeToRefs(view);
const { sel, sim, simActive, simEnabled, slotPos, activeRegion, sharedNum, citingActive } = storeToRefs(ui);
const keyList = computed(() => (['step', 'trans', 'or', 'and', 'jump'] as const).map((k) => K.value[k]).join(', '));
</script>

<template>
  <section class="stage" :aria-label="T('stage_aria')">
    <div
      id="canvas" ref="host" class="host" tabindex="0" role="application"
      :aria-label="T('canvas_aria', { k: keyList })" :style="gridStyle"
      @keydown="ui.onKey" @focus="ui.onHostFocus" @wheel.prevent="view.onWheel"
    >
      <svg class="cv" aria-hidden="true" @pointerdown="view.panStart" @pointermove="view.panMove" @pointerup="view.panEnd" @pointercancel="view.panEnd">
        <g :transform="gTransform">
          <rect v-if="activeRegion" class="region" :x="activeRegion.x1 - 8" :y="activeRegion.y1" :width="activeRegion.x2 - activeRegion.x1 + 16" :height="activeRegion.y2 - activeRegion.y1" rx="8" />
          <line v-for="(l, i) in layout.lines" :key="'l' + i" class="lk" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" />
          <template v-for="v in shapes" :key="v.id + (v.kind === 'bar' ? v.part : '')">
            <g v-if="v.kind === 'step'" class="el" :class="{ active: simActive.has(v.id), linked: sharedNum !== null && v.num === sharedNum, cites: citingActive.has(v.id) }" @pointerdown.stop="ui.pick(v.id)">
              <rect class="hit" :x="v.x - v.l" :y="v.ay" :width="v.l + v.r" :height="v.h + v.y - v.ay" />
              <g v-if="v.arrivals.length" class="arrival">
                <text class="jtxt" :x="v.x" :y="v.ay + 11" text-anchor="middle">{{ v.arrivals.join(', ') }}</text>
                <polygon class="arrow" :points="(v.x - 5) + ',' + (v.ay + 13) + ' ' + (v.x + 5) + ',' + (v.ay + 13) + ' ' + v.x + ',' + (v.ay + 22)" />
              </g>
              <rect class="st-box" :x="v.x - v.w / 2" :y="v.y" :width="v.w" height="40" />
              <rect v-if="v.initial" class="st-in" :x="v.x - v.w / 2 + 4" :y="v.y + 4" :width="v.w - 8" height="32" />
              <text class="st-num" :x="v.x" :y="v.y + 25" text-anchor="middle">{{ v.num }}</text>
              <text v-if="v.name" class="st-name" :x="v.x - v.w / 2 - 8" :y="v.y + 24" text-anchor="end">{{ v.name }}</text>
              <circle v-if="simActive.has(v.id)" class="tok" :cx="v.x" :cy="v.y + 33" r="3.4" />
              <g v-for="a in v.acts" :key="a.i">
                <rect v-if="a.cell" class="act-box" :x="a.x" :y="a.y" :width="a.condW" height="22" />
                <text v-if="a.cell" class="act-txt" :x="a.x + a.condW / 2" :y="a.y + 15" text-anchor="middle">{{ a.cond || '?' }}</text>
                <rect class="act-box" :x="a.x + a.condW" :y="a.y" :width="a.labW" height="22" />
                <text class="act-txt" :x="a.x + a.condW + 8" :y="a.y + 15">{{ a.text }}</text>
              </g>
              <rect v-if="sel === v.id" class="ring" :x="v.x - v.w / 2 - 5" :y="v.y - 5" :width="v.w + 10" height="50" rx="5" />
            </g>
            <g v-else-if="v.kind === 'trans'" class="el" :class="{ enabled: simEnabled.has(v.id), cites: citingActive.has(v.id) }" @pointerdown.stop="ui.pick(v.id)">
              <rect class="hit" :x="v.x - v.l" :y="v.ay" :width="v.l + v.r" :height="v.h + v.y - v.ay" />
              <g v-if="v.arrivals.length" class="arrival">
                <text class="jtxt" :x="v.x" :y="v.ay + 11" text-anchor="middle">{{ v.arrivals.join(', ') }}</text>
                <polygon class="arrow" :points="(v.x - 5) + ',' + (v.ay + 13) + ' ' + (v.x + 5) + ',' + (v.ay + 13) + ' ' + v.x + ',' + (v.ay + 22)" />
              </g>
              <line class="tick" :x1="v.x - 9" :x2="v.x + 9" :y1="v.y + 20" :y2="v.y + 20" />
              <text class="tnum" :x="v.x - 17" :y="v.y + 24" text-anchor="end">({{ v.num }})</text>
              <text class="rec" :class="{ empty: !v.recept }" :x="v.x + 17" :y="v.y + 24">{{ v.recept || '?' }}</text>
              <rect v-if="sel === v.id" class="ring" :x="v.x - 15" :y="v.y + 11" width="30" height="18" rx="4" />
            </g>
            <g v-else-if="v.kind === 'jump'" class="el" @pointerdown.stop="ui.pick(v.id)">
              <rect class="hit" :x="v.x - v.l" :y="v.y" :width="v.l + v.r" :height="v.h" />
              <polygon class="arrow" :points="(v.x - 5) + ',' + (v.y + 22) + ' ' + (v.x + 5) + ',' + (v.y + 22) + ' ' + v.x + ',' + (v.y + 31)" />
              <text class="jtxt" :class="{ broken: v.broken }" :x="v.x" :y="v.y + 43" text-anchor="middle">{{ v.label }}</text>
              <rect v-if="sel === v.id" class="ring" :x="v.x - v.l" :y="v.y + 14" :width="v.l + v.r" height="34" rx="5" />
            </g>
            <g v-else-if="v.kind === 'bar'" class="el" @pointerdown.stop="ui.pick(v.part === 'd' ? v.id + ':d' : v.id)">
              <rect class="hit" :x="v.x1 - 4" :y="v.ys[0]! - 9" :width="v.x2 - v.x1 + 8" :height="v.ys[v.ys.length - 1]! - v.ys[0]! + 18" />
              <line v-for="(yy, i) in v.ys" :key="i" class="bar" :x1="v.x1" :x2="v.x2" :y1="yy" :y2="yy" />
              <rect v-if="sel === (v.part === 'd' ? v.id + ':d' : v.id)" class="ring" :x="v.x1 - 5" :y="v.ys[0]! - 8" :width="v.x2 - v.x1 + 10" :height="v.ys[v.ys.length - 1]! - v.ys[0]! + 16" rx="5" />
            </g>
          </template>
          <g v-if="slotPos" class="slot" :transform="'translate(' + slotPos.x + ',' + slotPos.y + ')'"><circle r="8.5" /><path d="M-3.6 0H3.6M0 -3.6V3.6" /></g>
        </g>
      </svg>
      <div id="kbd-hint" class="cues">
        <span><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> {{ T('cue_nav') }}</span>
        <span><kbd>{{ K.step }}</kbd><kbd>{{ K.trans }}</kbd><kbd>{{ K.or }}</kbd><kbd>{{ K.and }}</kbd><kbd>{{ K.jump }}</kbd> {{ T('cue_ins') }}</span>
        <span><kbd>{{ T('kbd_shift') }}</kbd>+<kbd>…</kbd> {{ T('cue_shift') }}</span>
        <span><kbd>{{ T('kbd_del') }}</kbd> {{ T('cue_del') }}</span><span><kbd>{{ T('kbd_enter') }}</kbd> {{ T('cue_props') }}</span>
      </div>
    </div>

    <InsertBar />
    <div v-if="sim.on" class="simbar">
      <p><b>{{ T('sim') }}</b>{{ T('colon') }}{{ T('sim_help') }}</p>
      <button class="btn solid" @click="ui.simReset()"><Icon n="reset" />{{ T('sim_reset') }}</button>
    </div>
  </section>
</template>
