<script setup lang="ts">
import { computed } from 'vue';

const ICONS: Record<string, string> = {
  undo: 'M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  zin: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.3-4.3 M11 8v6 M8 11h6',
  zout: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.3-4.3 M8 11h6',
  fit: 'M8 3H5a2 2 0 0 0-2 2v3 M21 8V5a2 2 0 0 0-2-2h-3 M3 16v3a2 2 0 0 0 2 2h3 M16 21h3a2 2 0 0 0 2-2v-3',
  play: 'M7 4.5v15l12-7.5z',
  stop: 'M6 6h12v12H6z',
  plus: 'M12 5v14 M5 12h14',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  auto: 'M12 3a9 9 0 1 0 0 18V3z M12 3a9 9 0 0 1 0 18',
  reset: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5',
  check: 'm5 12 5 5 9-10',
  warn: 'M12 3 2 20h20L12 3z M12 10v4 M12 17.5v.5',
  download: 'M12 4v11 M7 11l5 5 5-5 M5 20h14',
};
const props = defineProps<{ n: string }>();
const d = computed(() => ICONS[props.n]);
</script>

<template>
  <svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="d" /></svg>
</template>
