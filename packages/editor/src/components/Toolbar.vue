<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { KEYMAP, T, lang } from '../i18n';
import { useUiStore } from '../stores/ui';

const ui = useUiStore();
const { sim, sel, caps, selText, selItem, selEmpty, selEnds, selBranch, selLink, selJump, insertWhere, pending } = storeToRefs(ui);
const key = (k: keyof (typeof KEYMAP)['fr']) => KEYMAP[lang.value][k];
const can = (v: boolean | undefined) => !!v;
const where = () => (selEmpty.value ? 'after' : insertWhere.value);
const closeMore = (e: KeyboardEvent): void => {
  const d = e.currentTarget as HTMLDetailsElement;
  if (!d.open) return;
  d.open = false;
  d.querySelector('summary')?.focus();
};
const pendingText = () => (pending.value ? T('pending_' + pending.value.kind) : '');
</script>

<template>
  <div v-if="!sim.on && pending" class="insbar toolbar" role="toolbar" :aria-label="T('tb_aria')">
    <span class="ins-none"><b>{{ pendingText() }}</b></span>
    <button class="tb" @click="ui.cancelPending(); ui.focusHost()" aria-keyshortcuts="Escape"><kbd aria-hidden="true">{{ T('kbd_esc') }}</kbd><span class="l">{{ T('pending_cancel') }}</span></button>
  </div>
  <div v-else-if="!sim.on && sel && caps" class="insbar toolbar dock" role="toolbar" :aria-label="T('ins_aria', { t: selText })">
    <div class="tb-ctx">
      <span class="dotc"></span>
      <div v-if="selItem" class="seg wheresel" role="group" :aria-label="T('ins_mode_aria')">
        <button type="button" :aria-pressed="insertWhere === 'before'" @click="insertWhere = 'before'; ui.focusHost()">{{ T('ins_before') }}</button>
        <button type="button" :aria-pressed="insertWhere === 'after'" @click="insertWhere = 'after'; ui.focusHost()">{{ T('ins_after') }}</button>
      </div>
      <b class="tb-sel">{{ selText }}</b>
      <span class="tb-grow"></span>
      <details class="tb-more" @keydown.esc="closeMore">
        <summary class="tb">{{ T('tb_more') }}</summary>
        <div class="tb-pop">
          <span class="tb-title">{{ T('tb_free') }}</span>
          <button class="tb" @click="ui.addFree('seq')"><span class="l">{{ T('tb_new_seq') }}</span></button>
          <button class="tb" @click="ui.addFree('div_or')"><span class="l">{{ T('tb_open_div_or') }}</span></button>
          <button class="tb" @click="ui.addFree('div_and')"><span class="l">{{ T('tb_open_div_and') }}</span></button>
          <button class="tb" @click="ui.addFree('conv_or')"><span class="l">{{ T('tb_open_conv_or') }}</span></button>
          <button class="tb" @click="ui.addFree('conv_and')"><span class="l">{{ T('tb_open_conv_and') }}</span></button>
        </div>
      </details>
      <button class="tb danger" :disabled="!selLink && !selJump && !selItem && !selEmpty" :title="selLink ? T('tb_del_link') : T('del')" @click="ui.removeSel()" aria-keyshortcuts="Delete"><kbd aria-hidden="true">{{ T('kbd_del') }}</kbd><span class="l">{{ selLink ? T('tb_del_link') : selJump ? T('tb_del_jump') : T('del') }}</span></button>
    </div>

    <div class="tb-row">
      <div class="tb-group" role="group" :aria-label="T('tb_insert')">
        <span class="tb-title">{{ T('tb_insert') }}</span>
        <button class="tb" :disabled="!can(caps.insert.step[where()])" @click="ui.insertKind('step')" :aria-keyshortcuts="key('step')"><kbd aria-hidden="true">{{ key('step') }}</kbd><span class="l">{{ T('k_step') }}</span></button>
        <button class="tb" :disabled="!can(caps.insert.trans[where()])" @click="ui.insertKind('trans')" :aria-keyshortcuts="key('trans')"><kbd aria-hidden="true">{{ key('trans') }}</kbd><span class="l">{{ T('k_trans') }}</span></button>
      </div>

      <div v-if="caps.div.or || caps.div.and" class="tb-group" role="group" :aria-label="T('tb_div')" :title="T('tb_div_hint')">
        <span class="tb-title">{{ T('tb_div_short') }}</span>
        <button v-if="caps.div.or" class="tb" @click="ui.addLinkAt('div', 'or')" :aria-keyshortcuts="key('or')"><i class="ico ico-or" aria-hidden="true"></i><kbd aria-hidden="true">{{ key('or') }}</kbd><span class="l">{{ T('op_or') }}</span></button>
        <button v-if="caps.div.and" class="tb" @click="ui.addLinkAt('div', 'and')" :aria-keyshortcuts="key('and')"><i class="ico ico-and" aria-hidden="true"></i><kbd aria-hidden="true">{{ key('and') }}</kbd><span class="l">{{ T('op_and') }}</span></button>
      </div>
      <div v-if="caps.conv.or || caps.conv.and" class="tb-group" role="group" :aria-label="T('tb_conv')" :title="T('tb_conv_hint')">
        <span class="tb-title">{{ T('tb_conv_short') }}</span>
        <button v-if="caps.conv.or" class="tb" @click="ui.addLinkAt('conv', 'or')" :aria-keyshortcuts="'Shift+' + key('or')"><i class="ico ico-or" aria-hidden="true"></i><kbd aria-hidden="true">{{ T('kbd_shift') }}+{{ key('or') }}</kbd><span class="l">{{ T('op_or') }}</span></button>
        <button v-if="caps.conv.and" class="tb" @click="ui.addLinkAt('conv', 'and')" :aria-keyshortcuts="'Shift+' + key('and')"><i class="ico ico-and" aria-hidden="true"></i><kbd aria-hidden="true">{{ T('kbd_shift') }}+{{ key('and') }}</kbd><span class="l">{{ T('op_and') }}</span></button>
      </div>

      <div v-if="caps.jump || (selItem && (selEnds.last || selEnds.first))" class="tb-group" role="group" :aria-label="T('tb_join')">
        <span class="tb-title">{{ T('tb_join') }}</span>
        <button v-if="caps.jump" class="tb" :title="T('tb_jump_hint')" @click="ui.addJumpSel()" :aria-keyshortcuts="key('jump')"><kbd aria-hidden="true">{{ key('jump') }}</kbd><span class="l">{{ T('k_jump') }}</span></button>
        <button v-if="caps.jump" class="tb" :title="T('tb_jump_to_hint')" @click="ui.startPending('jump')"><span class="l">{{ T('tb_jump_to') }}</span></button>
        <button v-if="selItem && selEnds.last" class="tb" :title="T('tb_connect_hint')" @click="ui.startPending('connect')" :aria-keyshortcuts="key('link')"><kbd aria-hidden="true">{{ key('link') }}</kbd><span class="l">{{ T('tb_connect') }}</span></button>
        <button v-if="selItem && selEnds.last" class="tb" :title="T('tb_merge_ends_hint')" @click="ui.startPending('mergeEnds')"><span class="l">{{ T('tb_merge_ends') }}</span></button>
        <button v-if="selItem && selEnds.first" class="tb" :title="T('tb_merge_starts_hint')" @click="ui.startPending('mergeStarts')"><span class="l">{{ T('tb_merge_starts') }}</span></button>
      </div>

      <div v-if="selBranch" class="tb-group" role="group" :aria-label="T('tb_branch')">
        <span class="tb-title">{{ T('tb_branch') }}</span>
        <button class="tb" :title="T('branch_l')" :aria-label="T('branch_add') + ' ' + T('branch_l').toLowerCase()" @click="ui.addBranch(-1)"><span class="l" aria-hidden="true">+ ◀</span></button>
        <button class="tb" :title="T('branch_r')" :aria-label="T('branch_add') + ' ' + T('branch_r').toLowerCase()" @click="ui.addBranch(1)"><span class="l" aria-hidden="true">▶ +</span></button>
        <button v-if="ui.canMoveBranch(-1)" class="tb" :title="T('branch_move_l')" :aria-label="T('branch_move_l')" @click="ui.moveBranch(-1)"><span class="l" aria-hidden="true">←</span></button>
        <button v-if="ui.canMoveBranch(1)" class="tb" :title="T('branch_move_r')" :aria-label="T('branch_move_r')" @click="ui.moveBranch(1)"><span class="l" aria-hidden="true">→</span></button>
        <button v-if="caps.removeBranch" class="tb" @click="ui.delBranch()"><span class="l">{{ T('branch_del') }}</span></button>
      </div>
    </div>
  </div>
  <div v-else-if="!sim.on" class="insbar toolbar">
    <span class="ins-none">{{ T('ins_help') }}</span>
    <details class="tb-more" @keydown.esc="closeMore">
      <summary class="tb">{{ T('tb_more') }}</summary>
      <div class="tb-pop">
        <button class="tb" @click="ui.addFree('seq')"><span class="l">{{ T('tb_new_seq') }}</span></button>
        <button class="tb" @click="ui.addFree('div_or')"><span class="l">{{ T('tb_open_div_or') }}</span></button>
        <button class="tb" @click="ui.addFree('div_and')"><span class="l">{{ T('tb_open_div_and') }}</span></button>
        <button class="tb" @click="ui.addFree('conv_or')"><span class="l">{{ T('tb_open_conv_or') }}</span></button>
        <button class="tb" @click="ui.addFree('conv_and')"><span class="l">{{ T('tb_open_conv_and') }}</span></button>
      </div>
    </details>
  </div>
</template>
