<script setup lang="ts">
import { docOrder, indexOf, type Grafcet, type HLink, type Seq } from '@grafcet/core';
import { computed } from 'vue';
import { describeText } from '../format';
import { T } from '../i18n';
import { describe } from '@grafcet/core';

const props = defineProps<{ sel: string | null; g: Grafcet }>();
defineEmits<{ pick: [id: string] }>();
const ix = computed(() => indexOf(props.g));
const seqs = computed(() => docOrder(props.g));
const rank = (s: Seq) => seqs.value.indexOf(s) + 1;
/** Liens qui touchent une séquence : en tête (divergence qui l'ouvre, convergence dont elle est l'aval) et en queue. */
const head = (s: Seq): { link: HLink; role: string } | null => { const u = ix.value.startUse.get(s.id); return u ? { link: u.link, role: u.role } : null; };
const tail = (s: Seq): { link: HLink; role: string } | null => { const u = ix.value.endUse.get(s.id); return u && 'link' in u ? { link: u.link, role: u.role } : null; };
const linkLabel = (l: HLink) => T((l.kind === 'div' ? 'div_' : 'conv_') + l.op) + ' · ' + T('n_branches', { n: l.nodes.length });
const seqName = (id: string) => T('ol_seq', { n: rank(ix.value.seq.get(id)!) });
const jumpOf = (s: Seq) => props.g.jumps.find((j) => j.from === s.id);
const jumpText = (id: string) => describeText({ key: 'd_jump_none' }) && T('ol_jump', { d: describeText(describeJump(id)) });
function describeJump(id: string) { const j = props.g.jumps.find((x) => x.id === id)!; const t = j.to ? ix.value.node.get(j.to)?.item : undefined; return t ? { key: t.kind === 'step' ? 'd_jump_step' : 'd_jump_trans', params: { n: t.num } } : { key: 'd_jump_none' }; }
</script>

<template>
  <ol class="ol">
    <li v-for="s in seqs" :key="s.id" class="ol-seq">
      <span class="ol-label">{{ T('ol_seq', { n: rank(s) }) }}
        <template v-if="head(s)"> · {{ head(s)!.role === 'child' ? T('ol_from') : T('ol_after') }} {{ T('ol_bar', { n: g.links.indexOf(head(s)!.link) + 1 }) }}</template>
      </span>
      <ul class="ol">
        <li v-if="head(s)"><button class="ol-btn" :class="{ on: sel === head(s)!.link.id }" @click="$emit('pick', head(s)!.link.id)">{{ T('ol_bar', { n: g.links.indexOf(head(s)!.link) + 1 }) }} : {{ linkLabel(head(s)!.link) }}</button></li>
        <li v-if="!s.items.length"><button class="ol-btn" :class="{ on: sel === s.id }" @click="$emit('pick', s.id)">{{ T('d_seq_empty') }}</button></li>
        <li v-for="it in s.items" :key="it.id"><button class="ol-btn" :class="{ on: sel === it.id }" @click="$emit('pick', it.id)">{{ describeText(describe(it)) }}</button></li>
        <li v-if="jumpOf(s)"><button class="ol-btn" :class="{ on: sel === jumpOf(s)!.id }" @click="$emit('pick', jumpOf(s)!.id)">{{ jumpText(jumpOf(s)!.id) }}</button></li>
        <li v-if="tail(s) && tail(s)!.link !== head(s)?.link"><button class="ol-btn" :class="{ on: sel === tail(s)!.link.id }" @click="$emit('pick', tail(s)!.link.id)">{{ tail(s)!.role === 'base' ? T('ol_to_div') : T('ol_to_conv') }} {{ T('ol_bar', { n: g.links.indexOf(tail(s)!.link) + 1 }) }} : {{ linkLabel(tail(s)!.link) }}</button></li>
      </ul>
    </li>
  </ol>
</template>
