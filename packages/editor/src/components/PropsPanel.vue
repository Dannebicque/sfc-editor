<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { arrivalSources, arrivalsTo, describeId, walkAll, walkGrafcet } from '@grafcet/core';
import { describeText } from '../format';
import { T, keys as K } from '../i18n';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import Icon from './Icon.vue';

const project = useProjectStore();
const ui = useUiStore();
const { activeG, stats, varList } = storeToRefs(project);
const { selItem, selLoc, recFb, tokens, jumpTargets } = storeToRefs(ui);
const allSteps = computed(() => {
  const out: { id: string; num: string }[] = [];
  walkGrafcet(activeG.value, (it) => { if (it.kind === 'step') out.push({ id: it.id, num: it.num }); });
  return out;
});
const stepLabel = (id: string) => allSteps.value.find((s) => s.id === id)?.num ?? '?';
const syncChoices = computed(() => allSteps.value.filter((s) => !(selItem.value && selItem.value.kind === 'trans' && selItem.value.sync?.includes(s.id))));
const arrivalList = computed(() => (selItem.value ? arrivalsTo(activeG.value, selItem.value.id).map((j) => ({ id: j.id, label: describeText(describeId(activeG.value, j.id)) })) : []));
const arrivalChoices = computed(() => (selItem.value ? arrivalSources(activeG.value, selItem.value.id).map((id) => ({ id, label: describeText(describeId(activeG.value, id)) })) : []));
const val = (e: Event) => (e.target as HTMLInputElement).value;
const checked = (e: Event) => (e.target as HTMLInputElement).checked;
</script>

<template>
  <div id="pan-props" class="panel" role="tabpanel" aria-labelledby="tab-props" @keydown.esc="ui.focusHost()">
    <template v-if="selItem && selItem.kind === 'step'">
      <h2>{{ T('d_step', { n: selItem.num }) }}</h2>
      <div class="field"><label for="f-name">{{ T('f_name') }}</label><input id="f-name" type="text" data-main-field :value="selItem.name" @input="ui.setField('name', val($event), true)" /></div>
      <div class="field"><label for="f-num">{{ T('f_num') }}</label><input id="f-num" type="text" spellcheck="false" autocomplete="off" :value="selItem.num" @input="ui.setField('num', val($event).trim(), true)" /></div>
      <div v-if="ui.citedIn.length || ui.citingActive.size" class="shared-box">
        <h3>{{ T('h_cited') }}</h3>
        <p v-if="ui.citingActive.size" class="hint">{{ T('cited_here', { n: ui.citingActive.size }) }}</p>
        <ul class="shared-list">
          <li v-for="c in ui.citedIn" :key="c.gid"><button class="btn solid" @click="ui.openG(c.gid, c.itemId)">{{ T('cited_go', { g: c.name || '?', c: c.count }) }}</button></li>
        </ul>
      </div>
      <div v-if="ui.linkedIn.length" class="shared-box">
        <h3>{{ T('h_shared') }}</h3>
        <ul class="shared-list">
          <li v-for="l in ui.linkedIn" :key="l.gid"><button class="btn solid" @click="ui.openG(l.gid, l.itemId)">{{ T('shared_go', { g: l.name || '?' }) }}</button></li>
        </ul>
      </div>
      <label class="check"><input type="checkbox" :checked="selItem.initial" @change="ui.setField('initial', checked($event))" /> {{ T('f_initial') }}</label>
      <div class="field">
        <label for="f-role">{{ T('f_role') }}</label>
        <select id="f-role" :value="selItem.role ?? ''" @change="ui.setRole(val($event))">
          <option value="">{{ T('role_none') }}</option><option value="entry">{{ T('role_entry') }}</option><option value="exit">{{ T('role_exit') }}</option>
        </select>
      </div>
      <div v-if="ui.parentsOfActive.length" class="shared-box">
        <h3>{{ T('h_expansion_of') }}</h3>
        <ul class="shared-list">
          <li v-for="p in ui.parentsOfActive" :key="p.gid + p.itemId"><button class="btn solid" @click="ui.openG(p.gid, p.itemId)">{{ T('exp_back', { n: p.num, g: p.name || '?' }) }}</button></li>
        </ul>
      </div>
      <label class="check"><input type="checkbox" :checked="selItem.expansion !== undefined" @change="ui.toggleMacro(checked($event))" /> {{ T('f_macro') }}</label>
      <template v-if="selItem.expansion !== undefined">
        <div class="field">
          <label for="f-exp">{{ T('f_expansion') }}</label>
          <select id="f-exp" :value="selItem.expansion ?? ''" @change="ui.setExpansion(val($event) || null)">
            <option value="">{{ T('exp_none') }}</option>
            <option v-for="g in project.project.grafcets.filter((x) => x.id !== activeG.id)" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </div>
        <div class="row">
          <button v-if="selItem.expansion === null" class="btn solid" @click="ui.makeExpansion()"><Icon n="plus" />{{ T('exp_create') }}</button>
          <button v-else class="btn solid" @click="ui.openExpansion()">{{ T('exp_open') }}</button>
        </div>
      </template>
      <h3>{{ T('h_conv_or') }}</h3>
      <p class="hint">{{ T('conv_or_hint') }}</p>
      <ul v-if="arrivalList.length" class="acts">
        <li v-for="a in arrivalList" :key="a.id" class="mini">
          <button class="btn solid" @click="ui.pickFromText(a.id)">{{ a.label }}</button>
          <button class="btn icon" :aria-label="T('conv_del_aria', { d: a.label })" @click="ui.removeArrival(a.id)"><Icon n="trash" /></button>
        </li>
      </ul>
      <div v-if="arrivalChoices.length" class="field">
        <label for="f-arr">{{ T('conv_add') }}</label>
        <select id="f-arr" @change="ui.addArrivalFrom(val($event)); ($event.target as HTMLSelectElement).value = ''">
          <option value="">{{ T('conv_choose') }}</option>
          <option v-for="c in arrivalChoices" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
      </div>
      <template v-if="selItem.expansion === undefined">
      <h3>{{ T('h_actions') }}</h3>
      <ul v-if="selItem.actions.length" class="acts">
        <li v-for="(a, i) in selItem.actions" :key="i">
          <div class="mini">
            <input type="text" class="mono" :aria-label="T('act_label_aria', { n: i + 1 })" :placeholder="T('act_ph')" :value="a.label" @input="ui.setAction(i, 'label', val($event))" />
            <button class="btn icon" :aria-label="T('act_del_aria', { n: i + 1 })" @click="ui.delAction(i)"><Icon n="trash" /></button>
          </div>
          <div class="mini two">
            <select :aria-label="T('act_type_aria', { n: i + 1 })" :value="a.kind" @change="ui.setAction(i, 'kind', val($event))">
              <option value="continue">{{ T('act_continue') }}</option><option value="conditional">{{ T('act_conditional') }}</option>
              <option value="activation">{{ T('act_activation') }}</option><option value="deactivation">{{ T('act_deactivation') }}</option><option value="event">{{ T('act_event') }}</option>
            </select>
            <input v-if="a.kind === 'conditional' || a.kind === 'event'" type="text" class="mono" :aria-label="T(a.kind === 'event' ? 'act_event_aria' : 'act_cond_aria', { n: i + 1 })" :placeholder="T(a.kind === 'event' ? 'act_event_ph' : 'act_cond_ph')" :value="a.cond" @input="ui.setAction(i, 'cond', val($event))" />
          </div>
        </li>
      </ul>
      <p v-else class="hint">{{ T('act_none') }}</p>
      <button class="btn solid" @click="ui.addAction()"><Icon n="plus" />{{ T('act_add') }}</button>
      </template>
    </template>

    <template v-else-if="selItem && selItem.kind === 'trans'">
      <h2>{{ T('d_trans', { n: selItem.num }) }}</h2>
      <div class="field">
        <label for="f-rec">{{ T('f_recept') }}</label>
        <input id="f-rec" type="text" class="mono" data-main-field spellcheck="false" autocomplete="off" aria-describedby="rec-fb" :value="selItem.recept" @input="ui.setField('recept', val($event), true)" />
      </div>
      <p id="rec-fb" class="fb" :class="recFb.cls"><Icon :n="recFb.cls === 'ok' ? 'check' : 'warn'" /><span>{{ recFb.msg }}</span></p>
      <div class="chips" role="group" :aria-label="T('chips_aria')">
        <button v-for="t in tokens" :key="t.v" class="chip" :title="t.t" @click="ui.addToken(t.v)">{{ t.v.trim() }}</button>
      </div>
      <p class="hint">{{ T('syntax') }} <code class="mono">.</code> {{ T('s_and') }}, <code class="mono">+</code> {{ T('s_or') }}, <code class="mono">/a</code> {{ T('s_not') }}, <code class="mono">↑a</code> {{ T('s_rise') }}, <code class="mono">X3</code> {{ T('s_step') }}, <code class="mono">t1/X2/3s</code> {{ T('s_delay') }}.</p>
      <h3>{{ T('h_conv_or') }}</h3>
      <p class="hint">{{ T('conv_or_hint') }}</p>
      <ul v-if="arrivalList.length" class="acts">
        <li v-for="a in arrivalList" :key="a.id" class="mini">
          <button class="btn solid" @click="ui.pickFromText(a.id)">{{ a.label }}</button>
          <button class="btn icon" :aria-label="T('conv_del_aria', { d: a.label })" @click="ui.removeArrival(a.id)"><Icon n="trash" /></button>
        </li>
      </ul>
      <div v-if="arrivalChoices.length" class="field">
        <label for="f-arr">{{ T('conv_add') }}</label>
        <select id="f-arr" @change="ui.addArrivalFrom(val($event)); ($event.target as HTMLSelectElement).value = ''">
          <option value="">{{ T('conv_choose') }}</option>
          <option v-for="c in arrivalChoices" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
      </div>
      <h3>{{ T('h_sync') }}</h3>
      <p class="hint">{{ T('sync_hint') }}</p>
      <ul v-if="selItem.sync?.length" class="acts">
        <li v-for="sid in selItem.sync" :key="sid" class="mini">
          <span class="mono">{{ stepLabel(sid) }}</span>
          <button class="btn icon" :aria-label="T('sync_del_aria', { n: stepLabel(sid) })" @click="ui.delSync(sid)"><Icon n="trash" /></button>
        </li>
      </ul>
      <div class="field">
        <label for="f-sync">{{ T('sync_add') }}</label>
        <select id="f-sync" @change="ui.addSync(val($event)); ($event.target as HTMLSelectElement).value = ''">
          <option value="">{{ T('sync_choose') }}</option>
          <option v-for="s in syncChoices" :key="s.id" :value="s.id">{{ s.num }}</option>
        </select>
      </div>
      <h3>{{ T('h_trans_actions') }}</h3>
      <p class="hint">{{ T('trans_act_help') }}</p>
      <ul v-if="selItem.actions?.length" class="acts">
        <li v-for="(a, i) in selItem.actions" :key="i">
          <div class="mini">
            <input type="text" class="mono" :aria-label="T('act_label_aria', { n: i + 1 })" :placeholder="T('act_ph')" :value="a.label" @input="ui.setAction(i, 'label', val($event))" />
            <button class="btn icon" :aria-label="T('act_del_aria', { n: i + 1 })" @click="ui.delAction(i)"><Icon n="trash" /></button>
          </div>
          <div class="mini">
            <input type="text" class="mono" :aria-label="T('act_cond_aria', { n: i + 1 })" :placeholder="T('act_cond_ph')" :value="a.cond" @input="ui.setAction(i, 'cond', val($event))" />
          </div>
        </li>
      </ul>
      <button class="btn solid" @click="ui.addAction()"><Icon n="plus" />{{ T('act_add') }}</button>
    </template>

    <template v-else-if="selItem && selItem.kind === 'jump'">
      <h2>{{ T('jump_title') }}</h2>
      <div class="field">
        <label for="f-target">{{ T('f_target') }}</label>
        <select id="f-target" data-main-field :value="selItem.target ?? ''" @change="ui.setField('target', val($event))">
          <option v-for="t in jumpTargets" :key="t.id" :value="t.id">{{ t.label }}</option>
        </select>
      </div>
      <p class="hint">{{ T('jump_hint') }}</p>
    </template>

    <template v-else-if="selItem && (selItem.kind === 'or' || selItem.kind === 'and')">
      <h2>{{ T(selItem.kind === 'or' ? 'div_or' : 'div_and') }}</h2>
      <p class="hint">{{ T(selItem.kind === 'or' ? 'or_hint' : 'and_hint') }}</p>
      <dl class="kv"><dt>{{ T('branches_k') }}</dt><dd>{{ selItem.branches.length }}</dd></dl>
      <div class="row"><button class="btn solid" @click="ui.addBranch(-1)"><Icon n="plus" />{{ T('branch_left') }}</button><button class="btn solid" @click="ui.addBranch(1)"><Icon n="plus" />{{ T('branch_right') }}</button></div>
    </template>

    <template v-else>
      <h2>{{ activeG.name }}</h2>
      <div class="field"><label for="g-name">{{ T('g_name') }}</label><input id="g-name" type="text" :value="activeG.name" @input="project.renameGrafcet(val($event))" /></div>
      <dl class="kv"><dt>{{ T('stat_steps') }}</dt><dd>{{ stats.steps }}</dd><dt>{{ T('stat_trans') }}</dt><dd>{{ stats.trans }}</dd><dt>{{ T('stat_blocks') }}</dt><dd>{{ stats.blocks }}</dd><dt>{{ T('stat_jumps') }}</dt><dd>{{ stats.jumps }}</dd></dl>
      <div class="row"><button class="btn solid" @click="ui.doRenumber()"><Icon n="reset" />{{ T('renumber') }}</button></div>
      <h3>{{ T('h_vars') }}</h3>
      <div v-if="varList.length" class="vars"><span v-for="v in varList" :key="v">{{ v }}</span></div>
      <p v-else class="hint">{{ T('vars_none') }}</p>
      <h3>{{ T('h_keyboard') }}</h3>
      <ul class="keys">
        <li><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> {{ T('key_move') }}</li>
        <li><kbd>{{ K.step }}</kbd><kbd>{{ K.trans }}</kbd><kbd>{{ K.or }}</kbd><kbd>{{ K.and }}</kbd><kbd>{{ K.jump }}</kbd> {{ T('key_insert') }}</li>
        <li><kbd>{{ T('kbd_del') }}</kbd> {{ T('key_delete') }}</li>
        <li><kbd>{{ T('kbd_enter') }}</kbd> {{ T('key_edit') }}, <kbd>{{ T('kbd_esc') }}</kbd> {{ T('key_back') }}</li>
        <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd> {{ T('key_undo') }}</li>
      </ul>
    </template>

    <template v-if="selItem && (selItem.kind === 'step' || selItem.kind === 'trans')">
      <h3>{{ T('h_structure') }}</h3>
      <div class="row">
        <button class="btn solid" :disabled="!ui.canWrap('or')" @click="ui.wrap('or')"><Icon n="plus" />{{ T('wrap_or') }}</button>
        <button class="btn solid" :disabled="!ui.canWrap('and')" @click="ui.wrap('and')"><Icon n="plus" />{{ T('wrap_and') }}</button>
      </div>
      <p class="hint">{{ T('wrap_hint') }}</p>
    </template>

    <template v-if="selItem && (selItem.kind === 'or' || selItem.kind === 'and')">
      <h3>{{ T('unwrap_title') }}</h3>
      <div class="row">
        <button v-for="(_, i) in selItem.branches" :key="i" class="btn solid" :disabled="!ui.canUnwrap(i)" @click="ui.unwrap(i)">{{ T('unwrap_keep', { n: i + 1 }) }}</button>
      </div>
      <p class="hint">{{ T('unwrap_hint') }}</p>
    </template>

    <template v-if="selItem && selLoc && selLoc.block">
      <h3>{{ T('branch_of', { i: selLoc.branchIdx + 1, n: selLoc.block.branches.length }) }}</h3>
      <div class="row">
        <button class="btn solid" @click="ui.addBranch(-1)"><Icon n="plus" />{{ T('branch_l') }}</button>
        <button class="btn solid" @click="ui.addBranch(1)"><Icon n="plus" />{{ T('branch_r') }}</button>
        <button class="btn solid danger" :disabled="selLoc.block.branches.length < 3" @click="ui.delBranch()"><Icon n="trash" />{{ T('branch_del') }}</button>
      </div>
      <div class="row">
        <button class="btn solid" :disabled="!ui.canMoveBranch(-1)" @click="ui.moveBranch(-1)">← {{ T('branch_move_l') }}</button>
        <button class="btn solid" :disabled="!ui.canMoveBranch(1)" @click="ui.moveBranch(1)">{{ T('branch_move_r') }} →</button>
      </div>
    </template>
    <h3>{{ T('h_seq') }}</h3>
    <p v-if="selItem" class="hint">{{ T('seq_pos', { i: ui.seqIdx + 1, n: ui.seqCount }) }}</p>
    <p v-else class="hint">{{ T('seq_hint') }}</p>
    <div class="row">
      <button class="btn solid" @click="ui.addSeq()"><Icon n="plus" />{{ T('seq_add') }}</button>
      <button v-if="selItem && ui.seqIdx > 0" class="btn solid danger" @click="ui.delSeq()"><Icon n="trash" />{{ T('seq_del') }}</button>
    </div>
    <div v-if="selItem && ui.seqCount > 1" class="row">
      <button class="btn solid" :disabled="ui.seqIdx < 1" @click="ui.moveSeq(-1)">← {{ T('seq_move_l') }}</button>
      <button class="btn solid" :disabled="ui.seqIdx >= ui.seqCount - 1" @click="ui.moveSeq(1)">{{ T('seq_move_r') }} →</button>
    </div>
    <div v-if="selItem" class="row"><button class="btn solid danger" @click="ui.removeSel()"><Icon n="trash" />{{ T('del_item') }}</button></div>
  </div>
</template>
