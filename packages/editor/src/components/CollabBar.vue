<script setup lang="ts">
import { computed } from 'vue';
import { T } from '../i18n';
import { useAccountStore } from '../stores/account';
import { initials, useCollabStore } from '../stores/collab';
import { useProjectStore } from '../stores/project';

const collab = useCollabStore();
const account = useAccountStore();
const project = useProjectStore();
const statusKey = computed(() => (collab.link === 'synced' ? 'synced' : collab.link === 'offline' ? 'offline' : 'connecting'));
</script>

<template>
  <section v-if="collab.current || collab.opening" class="collabbar" :aria-label="T('collab_label')">
    <template v-if="collab.current">
      <span class="cb-name">{{ T('collab_online') }}</span>
      <span class="cb-state" :class="statusKey">{{ T('collab_status_' + statusKey) }}</span>
      <span v-if="project.readOnly" class="cb-state ro">{{ T('collab_readonly') }}</span>
      <ul class="cb-peers" :aria-label="T('collab_peers_label')">
        <li v-for="p in collab.others" :key="p.userId" :title="p.name + (p.editing ? '' : '')">
          <span class="avatar" :style="{ background: p.color }" aria-hidden="true">{{ initials(p.name) }}</span><span class="peer-name">{{ p.name }}</span>
        </li>
        <li v-if="!collab.others.length" class="hint">{{ T('collab_alone') }}</li>
      </ul>
      <span class="spacer"></span>
      <button class="btn solid" type="button" @click="account.open('members')">{{ T('collab_members_btn') }}</button>
      <button class="btn solid" type="button" @click="collab.close()">{{ T('collab_leave') }}</button>
    </template>
    <span v-else role="status">{{ T('collab_opening') }}</span>
  </section>
  <p v-if="collab.current && collab.conflict.length" class="collab-warn" role="status">{{ T('collab_conflict', { x: collab.conflict.join(', ') }) }}</p>
</template>
