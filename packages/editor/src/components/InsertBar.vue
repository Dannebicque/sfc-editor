<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { T } from '../i18n';
import { useUiStore } from '../stores/ui';

const ui = useUiStore();
const { sim, sel, allowed, isDivBar, selShort, selText } = storeToRefs(ui);
</script>

<template>
  <div v-if="!sim.on && sel" class="insbar" role="toolbar" :aria-label="T('ins_aria', { t: selText })">
    <div class="ins-ctx"><span class="dotc"></span><span>{{ T('ins_after') }} <b>{{ selShort }}</b></span></div>
    <button v-for="o in allowed" :key="o.kind" class="ins" @click="ui.insertKind(o.kind)">
      <kbd>{{ o.key }}</kbd><span class="l">{{ o.label }}<small v-if="o.note">{{ o.note }}</small></span>
    </button>
    <span v-if="!allowed.length" class="ins-none">{{ isDivBar ? T('ins_none_bar') : T('ins_none_end') }}</span>
    <button class="ins danger" :title="T('del')" @click="ui.removeSel()"><kbd>{{ T('kbd_del') }}</kbd><span class="l">{{ T('del') }}</span></button>
  </div>
  <div v-else-if="!sim.on" class="insbar"><span class="ins-none">{{ T('ins_help') }}</span></div>
</template>
