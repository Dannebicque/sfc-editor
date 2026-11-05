<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { T, lang } from '../i18n';
import { expand, LEGAL, LEGAL_DOCS, type Segment } from '../legal';
import { useUiStore } from '../stores/ui';

const ui = useUiStore();
const { legalDoc } = storeToRefs(ui);
const dlg = ref<HTMLDialogElement | null>(null);
const docs = computed(() => LEGAL_DOCS[lang.value]);
const current = computed(() => docs.value.find((d) => d.id === legalDoc.value) ?? null);

/** Ouvre ou ferme le <dialog> natif (piège à focus, Échap et restauration du focus fournis par le navigateur). */
watch(legalDoc, async (v) => {
  await nextTick();
  const d = dlg.value;
  if (!d) return;
  if (v && !d.open) d.showModal();
  else if (!v && d.open) d.close();
}, { immediate: true, flush: 'post' });

const seg = (text: string): Segment[] => expand(text, LEGAL, T('legal_todo'));
const href = (h: string): string => expand(h, LEGAL, '').map((s) => (typeof s === 'string' ? s : '')).join('');
const external = (h: string) => /^https?:/.test(href(h));
function onBackdrop(e: MouseEvent): void { if (e.target === dlg.value) ui.closeLegal(); }
</script>

<template>
  <dialog ref="dlg" class="legal" :aria-label="T('legal_dialog_aria')" @close="ui.closeLegal()" @click="onBackdrop">
    <div class="legal-head">
      <h2 id="legal-title" :lang="lang">{{ current?.title }}</h2>
      <button class="btn solid" type="button" @click="ui.closeLegal()">{{ T('legal_close') }}</button>
    </div>
    <div class="legal-body">
      <nav :aria-label="T('legal_nav_aria')">
        <ul>
          <li v-for="d in docs" :key="d.id">
            <button type="button" :aria-current="d.id === legalDoc ? 'page' : undefined" @click="ui.openLegal(d.id)">{{ d.title }}</button>
          </li>
        </ul>
      </nav>
      <article v-if="current" :lang="lang" tabindex="-1">
        <template v-for="(b, i) in current.blocks" :key="i">
          <h3 v-if="'h' in b">{{ b.h }}</h3>
          <p v-else-if="'p' in b"><template v-for="(s, j) in seg(b.p)" :key="j"><mark v-if="typeof s !== 'string'" class="todo">{{ s.todo }}</mark><template v-else>{{ s }}</template></template></p>
          <ul v-else-if="'ul' in b">
            <li v-for="(li, k) in b.ul" :key="k"><template v-for="(s, j) in seg(li)" :key="j"><mark v-if="typeof s !== 'string'" class="todo">{{ s.todo }}</mark><template v-else>{{ s }}</template></template></li>
          </ul>
          <div v-else-if="'table' in b" class="legal-table" tabindex="0" role="region" :aria-label="current.title">
            <table>
              <thead><tr><th v-for="h in b.table.head" :key="h" scope="col">{{ h }}</th></tr></thead>
              <tbody><tr v-for="(r, k) in b.table.rows" :key="k"><td v-for="(c, j) in r" :key="j">{{ c }}</td></tr></tbody>
            </table>
          </div>
          <p v-else-if="'a' in b"><a :href="href(b.a.href)" :target="external(b.a.href) ? '_blank' : undefined" rel="noopener noreferrer">{{ b.a.label }}</a></p>
        </template>
      </article>
    </div>
  </dialog>
</template>
