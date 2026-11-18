<script setup lang="ts">
import { onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useUiStore } from './stores/ui';
import AppHeader from './components/AppHeader.vue';
import CanvasStage from './components/CanvasStage.vue';
import InspectorPanel from './components/InspectorPanel.vue';
import ProjectSidebar from './components/ProjectSidebar.vue';
import LegalDialog from './components/LegalDialog.vue';
import DataDialog from './components/DataDialog.vue';
import ShareDialog from './components/ShareDialog.vue';
import { useShareStore } from './stores/share';
import AuthDialog from './components/AuthDialog.vue';
import ProjectsDialog from './components/ProjectsDialog.vue';
import AccountDialog from './components/AccountDialog.vue';
import MembersDialog from './components/MembersDialog.vue';
import CollabBar from './components/CollabBar.vue';
import { useAccountStore } from './stores/account';
import { useCollabStore } from './stores/collab';
import StatusBar from './components/StatusBar.vue';

const ui = useUiStore();
const { liveMsg } = storeToRefs(ui);
const share = useShareStore();
const account = useAccountStore();
const collab = useCollabStore();
onMounted(() => { ui.init(); share.init(); void account.init((id) => { void collab.open(id); }); });
</script>

<template>
  <div class="app">
    <div class="chrome">
      <AppHeader />
      <CollabBar v-if="account.enabled" />
    </div>
    <main class="work">
      <ProjectSidebar />
      <CanvasStage />
      <InspectorPanel />
    </main>
    <StatusBar />
    <LegalDialog />
    <DataDialog />
    <ShareDialog v-if="share.enabled" />
    <template v-if="account.enabled">
      <AuthDialog /><ProjectsDialog /><AccountDialog /><MembersDialog />
    </template>
    <div class="sr" role="status" aria-live="polite">{{ liveMsg }}</div>
  </div>
</template>
