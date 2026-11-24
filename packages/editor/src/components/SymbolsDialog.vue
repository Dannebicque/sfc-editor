<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { T } from '../i18n';
import { useUiStore } from '../stores/ui';
import ModalDialog from './ModalDialog.vue';

const ui = useUiStore();
const { symbolsOpen } = storeToRefs(ui);

/** Notations des réceptivités (symbole, clé du sens, exemple) : texte technique, non traduit. */
const RECEPT: Array<{ s: string; m: string; ex: string }> = [
  { s: '·  .  *', m: 'sym_r_and', ex: 'a . b' },
  { s: '+', m: 'sym_r_or', ex: 'a + b' },
  { s: '/', m: 'sym_r_not', ex: '/a' },
  { s: '↑', m: 'sym_r_up', ex: '↑a' },
  { s: '↓', m: 'sym_r_down', ex: '↓a' },
  { s: 'Xn', m: 'sym_r_step', ex: 'X3 . a' },
  { s: 't1/Xn/3s', m: 'sym_r_delay', ex: 't1/X2/3s' },
  { s: '3s/Xn', m: 'sym_r_delay2', ex: '3s/X2' },
  { s: '< > <= >= = !=', m: 'sym_r_cmp', ex: 'n >= 5' },
  { s: '( )  [ ]', m: 'sym_r_group', ex: '[a + b] . c' },
  { s: '0  1', m: 'sym_r_const', ex: '1' },
];
const SECTIONS = ['basic', 'branch', 'actions', 'recept'] as const;
</script>

<template>
  <ModalDialog id="symbols" cls="sym" :open="symbolsOpen" :title="T('sym_title')" @close="symbolsOpen = false">
    <p class="hint">{{ T('sym_intro') }}</p>
    <nav class="symnav" :aria-label="T('sym_nav')">
      <a v-for="s in SECTIONS" :key="s" :href="'#sym-' + s" @click.prevent="($event.currentTarget as HTMLElement).ownerDocument.getElementById('sym-' + s)?.scrollIntoView({ block: 'start' })">{{ T('sym_g_' + s) }}</a>
    </nav>

    <section aria-labelledby="sym-basic">
      <h3 id="sym-basic" class="acc-h" tabindex="-1">{{ T('sym_g_basic') }}</h3>
      <ul class="symlist">
        <li>
          <svg class="cv symfig" viewBox="0 0 96 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_step')"><line class="lk" x1="48" y1="0" x2="48" y2="8" /><rect class="st-box" x="28" y="8" width="40" height="40" /><text class="st-num" x="48" y="33" text-anchor="middle">3</text><line class="lk" x1="48" y1="48" x2="48" y2="56" /></svg>
          <div><b>{{ T('sym_step') }}</b><p>{{ T('sym_step_d') }}</p></div>
        </li>
        <li>
          <svg class="cv symfig" viewBox="0 0 96 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_initial')"><line class="lk" x1="48" y1="48" x2="48" y2="56" /><rect class="st-box" x="28" y="8" width="40" height="40" /><rect class="st-in" x="32" y="12" width="32" height="32" /><text class="st-num" x="48" y="33" text-anchor="middle">1</text></svg>
          <div><b>{{ T('sym_initial') }}</b><p>{{ T('sym_initial_d') }}</p></div>
        </li>
        <li>
          <svg class="cv symfig" viewBox="0 0 96 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_macro')"><line class="lk" x1="48" y1="0" x2="48" y2="8" /><rect class="st-box" x="28" y="8" width="40" height="40" /><g class="macro"><line x1="28" x2="68" y1="16" y2="16" /><line x1="28" x2="68" y1="40" y2="40" /></g><text class="st-num" x="48" y="33" text-anchor="middle">M2</text><line class="lk" x1="48" y1="48" x2="48" y2="56" /></svg>
          <div><b>{{ T('sym_macro') }}</b><p>{{ T('sym_macro_d') }}</p></div>
        </li>
        <li>
          <svg class="cv symfig" viewBox="0 0 96 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_task')"><line class="lk" x1="48" y1="0" x2="48" y2="8" /><rect class="st-box" x="28" y="8" width="40" height="40" /><text class="st-task" x="65" y="19" text-anchor="end">T</text><text class="st-num" x="48" y="33" text-anchor="middle">4</text><line class="lk" x1="48" y1="48" x2="48" y2="56" /></svg>
          <div><b>{{ T('sym_task') }}</b><p>{{ T('sym_task_d') }}</p></div>
        </li>
        <li>
          <svg class="cv symfig" viewBox="0 0 96 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_trans')"><line class="lk" x1="48" y1="0" x2="48" y2="56" /><line class="tick" x1="39" y1="28" x2="57" y2="28" /><text class="tnum" x="31" y="32" text-anchor="end">(1)</text><text class="rec" x="65" y="32">a.b</text></svg>
          <div><b>{{ T('sym_trans') }}</b><p>{{ T('sym_trans_d') }}</p></div>
        </li>
        <li>
          <svg class="cv symfig" viewBox="0 0 96 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_jump')"><line class="lk" x1="48" y1="0" x2="48" y2="22" /><polygon class="arrow" points="43,22 53,22 48,31" /><text class="jtxt" x="48" y="46" text-anchor="middle">12</text></svg>
          <div><b>{{ T('sym_jump') }}</b><p>{{ T('sym_jump_d') }}</p></div>
        </li>
        <li>
          <svg class="cv symfig" viewBox="0 0 96 64" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_arrival')"><text class="jtxt" x="48" y="11" text-anchor="middle">5, 8</text><polygon class="arrow" points="43,13 53,13 48,22" /><rect class="st-box" x="28" y="22" width="40" height="40" /><text class="st-num" x="48" y="47" text-anchor="middle">2</text></svg>
          <div><b>{{ T('sym_arrival') }}</b><p>{{ T('sym_arrival_d') }}</p></div>
        </li>
        <li>
          <svg class="cv symfig" viewBox="0 0 96 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_empty')"><rect class="x-box" x="33" y="13" width="30" height="30" rx="4" /><text class="x-txt" x="48" y="33" text-anchor="middle">X</text></svg>
          <div><b>{{ T('sym_empty') }}</b><p>{{ T('sym_empty_d') }}</p></div>
        </li>
      </ul>
    </section>

    <section aria-labelledby="sym-branch">
      <h3 id="sym-branch" class="acc-h" tabindex="-1">{{ T('sym_g_branch') }}</h3>
      <ul class="symlist">
        <li>
          <svg class="cv symfig" viewBox="0 0 96 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_or_div')"><line class="lk" x1="48" y1="0" x2="48" y2="20" /><line class="bar" x1="16" x2="80" y1="20" y2="20" /><line class="lk" x1="16" y1="20" x2="16" y2="56" /><line class="lk" x1="80" y1="20" x2="80" y2="56" /></svg>
          <div><b>{{ T('sym_or_div') }}</b><p>{{ T('sym_or_div_d') }}</p></div>
        </li>
        <li>
          <svg class="cv symfig" viewBox="0 0 96 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_or_conv')"><line class="lk" x1="16" y1="0" x2="16" y2="36" /><line class="lk" x1="80" y1="0" x2="80" y2="36" /><line class="bar" x1="16" x2="80" y1="36" y2="36" /><line class="lk" x1="48" y1="36" x2="48" y2="56" /></svg>
          <div><b>{{ T('sym_or_conv') }}</b><p>{{ T('sym_or_conv_d') }}</p></div>
        </li>
        <li>
          <svg class="cv symfig" viewBox="0 0 96 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_and_div')"><line class="lk" x1="48" y1="0" x2="48" y2="18" /><line class="bar" x1="16" x2="80" y1="18" y2="18" /><line class="bar" x1="16" x2="80" y1="23" y2="23" /><line class="lk" x1="16" y1="23" x2="16" y2="56" /><line class="lk" x1="80" y1="23" x2="80" y2="56" /></svg>
          <div><b>{{ T('sym_and_div') }}</b><p>{{ T('sym_and_div_d') }}</p></div>
        </li>
        <li>
          <svg class="cv symfig" viewBox="0 0 96 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_and_conv')"><line class="lk" x1="16" y1="0" x2="16" y2="31" /><line class="lk" x1="80" y1="0" x2="80" y2="31" /><line class="bar" x1="16" x2="80" y1="31" y2="31" /><line class="bar" x1="16" x2="80" y1="36" y2="36" /><line class="lk" x1="48" y1="36" x2="48" y2="56" /></svg>
          <div><b>{{ T('sym_and_conv') }}</b><p>{{ T('sym_and_conv_d') }}</p></div>
        </li>
      </ul>
    </section>

    <section aria-labelledby="sym-actions">
      <h3 id="sym-actions" class="acc-h" tabindex="-1">{{ T('sym_g_actions') }}</h3>
      <ul class="symlist">
        <li>
          <svg class="cv symfig wide" viewBox="0 0 150 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_act_cont')"><rect class="st-box" x="6" y="8" width="40" height="40" /><text class="st-num" x="26" y="33" text-anchor="middle">5</text><line class="lk" x1="46" y1="28" x2="60" y2="28" /><rect class="act-box" x="60" y="17" width="60" height="22" /><text class="act-txt" x="68" y="32">A+</text></svg>
          <div><b>{{ T('sym_act_cont') }}</b><p>{{ T('sym_act_cont_d') }}</p></div>
        </li>
        <li>
          <svg class="cv symfig wide" viewBox="0 0 150 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_act_cond')"><rect class="st-box" x="6" y="8" width="40" height="40" /><text class="st-num" x="26" y="33" text-anchor="middle">5</text><line class="lk" x1="46" y1="28" x2="52" y2="28" /><rect class="act-box act-cond" x="52" y="17" width="30" height="22" /><text class="act-txt act-cond-txt" x="67" y="32" text-anchor="middle">c</text><rect class="act-box" x="82" y="17" width="54" height="22" /><text class="act-txt" x="90" y="32">B</text></svg>
          <div><b>{{ T('sym_act_cond') }}</b><p>{{ T('sym_act_cond_d') }}</p></div>
        </li>
        <li>
          <svg class="cv symfig wide" viewBox="0 0 150 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_act_up')"><rect class="st-box" x="6" y="8" width="40" height="40" /><text class="st-num" x="26" y="33" text-anchor="middle">5</text><line class="lk" x1="46" y1="28" x2="60" y2="28" /><rect class="act-box" x="60" y="17" width="60" height="22" /><polygon class="act-mark" points="63,33 73,33 68,23" /><text class="act-txt" x="80" y="32">C</text></svg>
          <div><b>{{ T('sym_act_up') }}</b><p>{{ T('sym_act_up_d') }}</p></div>
        </li>
        <li>
          <svg class="cv symfig wide" viewBox="0 0 150 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_act_down')"><rect class="st-box" x="6" y="8" width="40" height="40" /><text class="st-num" x="26" y="33" text-anchor="middle">5</text><line class="lk" x1="46" y1="28" x2="60" y2="28" /><rect class="act-box" x="60" y="17" width="60" height="22" /><polygon class="act-mark" points="63,23 73,23 68,33" /><text class="act-txt" x="80" y="32">D</text></svg>
          <div><b>{{ T('sym_act_down') }}</b><p>{{ T('sym_act_down_d') }}</p></div>
        </li>
        <li>
          <svg class="cv symfig wide" viewBox="0 0 150 56" role="img" :aria-label="T('sym_fig_aria') + ' : ' + T('sym_act_event')"><line class="lk" x1="26" y1="0" x2="26" y2="56" /><line class="tick" x1="17" y1="28" x2="35" y2="28" /><line class="lk" x1="35" y1="28" x2="60" y2="28" /><rect class="act-box" x="60" y="17" width="60" height="22" /><polygon class="act-mark" points="63,28 72,22 72,34" /><text class="act-txt" x="80" y="32">E</text></svg>
          <div><b>{{ T('sym_act_event') }}</b><p>{{ T('sym_act_event_d') }}</p></div>
        </li>
      </ul>
    </section>

    <section aria-labelledby="sym-recept">
      <h3 id="sym-recept" class="acc-h" tabindex="-1">{{ T('sym_g_recept') }}</h3>
      <div class="legal-table" tabindex="0" role="region" :aria-label="T('sym_r_table')">
        <table>
          <thead><tr><th scope="col">{{ T('sym_r_head_sym') }}</th><th scope="col">{{ T('sym_r_head_mean') }}</th><th scope="col">{{ T('sym_r_head_ex') }}</th></tr></thead>
          <tbody><tr v-for="r in RECEPT" :key="r.s"><td>{{ r.s }}</td><td>{{ T(r.m) }}</td><td class="mono">{{ r.ex }}</td></tr></tbody>
        </table>
      </div>
    </section>
  </ModalDialog>
</template>
