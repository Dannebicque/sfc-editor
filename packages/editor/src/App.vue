<script setup lang="ts">
import { onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useUiStore } from './stores/ui';
import AppHeader from './components/AppHeader.vue';
import CanvasStage from './components/CanvasStage.vue';
import InspectorPanel from './components/InspectorPanel.vue';
import ProjectSidebar from './components/ProjectSidebar.vue';
import StatusBar from './components/StatusBar.vue';

const ui = useUiStore();
const { liveMsg } = storeToRefs(ui);
onMounted(() => ui.init());
</script>

<template>
  <div class="app">
    <AppHeader />
    <main class="work">
      <ProjectSidebar />
      <CanvasStage />
      <InspectorPanel />
    </main>
    <StatusBar />
    <div class="sr" role="status" aria-live="polite">{{ liveMsg }}</div>
  </div>
</template>
