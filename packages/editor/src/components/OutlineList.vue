<script setup lang="ts">
import type { Grafcet, Item } from '@grafcet/core';
import { describe } from '@grafcet/core';
import { describeText } from '../format';
import { T } from '../i18n';

defineProps<{ items: Item[]; sel: string | null; g: Grafcet }>();
defineEmits<{ pick: [id: string] }>();
const label = (it: Item, g: Grafcet) => describeText(describe(it, g));
</script>

<template>
  <ul class="ol">
    <li v-for="it in items" :key="it.id">
      <template v-if="it.kind === 'or' || it.kind === 'and'">
        <button class="ol-btn" :class="{ on: sel === it.id + ':d' }" @click="$emit('pick', it.id + ':d')">{{ T(it.kind === 'or' ? 'div_or' : 'div_and') }} · {{ T('n_branches', { n: it.branches.length }) }}</button>
        <ol class="ol-br">
          <li v-for="(b, bi) in it.branches" :key="bi">
            <span class="ol-label">{{ T('ol_branch', { n: bi + 1 }) }}</span>
            <OutlineList :items="b" :sel="sel" :g="g" @pick="$emit('pick', $event)" />
          </li>
        </ol>
        <button class="ol-btn" :class="{ on: sel === it.id }" @click="$emit('pick', it.id)">{{ T(it.kind === 'or' ? 'conv_or' : 'conv_and') }}</button>
      </template>
      <button v-else class="ol-btn" :class="{ on: sel === it.id }" @click="$emit('pick', it.id)">{{ label(it, g) }}</button>
    </li>
  </ul>
</template>
