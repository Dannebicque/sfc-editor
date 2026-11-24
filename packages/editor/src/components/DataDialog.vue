<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { T } from '../i18n';
import { useUiStore, type ExportFormat } from '../stores/ui';
import { shareLink } from '../share';
import { useShareStore } from '../stores/share';
import { useProjectStore } from '../stores/project';
import { useAccountStore } from '../stores/account';
import { isExportLocked } from '../limits';
import { track } from '../usage';
import Icon from './Icon.vue';

const ui = useUiStore();
const share = useShareStore();
const project = useProjectStore();
const account = useAccountStore();
const locked = computed(() => isExportLocked(cur.value.id, project.limits));
function signup(): void { ui.dataDialog = null; account.open('auth', 'register'); }
const { dataView, dataText, copyMsg, importMsg, importText, importReport, exportReport, dataDialog } = storeToRefs(ui);
const dlg = ref<HTMLDialogElement | null>(null);

/** <dialog> natif : piège à focus, Échap et restauration du focus fournis par le navigateur. */
watch(() => !!dataDialog.value, async (v) => {
  await nextTick();
  const d = dlg.value;
  if (!d) return;
  if (v && !d.open) d.showModal();
  else if (!v && d.open) d.close();
}, { immediate: true, flush: 'post' });
function onBackdrop(e: MouseEvent): void { if (e.target === dlg.value) dataDialog.value = null; }

/** Formats d'export, par groupe. `pick` : le choix des GRAFCET s'applique ; `text` : aperçu texte copiable ; `image` : aperçu du dessin. */
interface Fmt { id: ExportFormat; pick: boolean; text: boolean; image: boolean }
const F = (id: ExportFormat, o: Partial<Fmt> = {}): Fmt => ({ id, pick: false, text: false, image: false, ...o });
const groups = computed<{ title: string; items: Fmt[] }[]>(() => [
  { title: T('grp_files'), items: [F('native', { pick: true, text: true }), F('sfcedit', { pick: true, text: true }), F('plcopen', { pick: true, text: true }), F('zip'), ...(ui.canFolder ? [F('folder')] : [])] },
  { title: T('grp_images'), items: [F('svg', { pick: true, image: true }), F('png', { pick: true, image: true }), F('pdf', { pick: true, image: true })] },
  { title: T('grp_other'), items: [F('share'), F('json', { text: true }), F('graph', { text: true })] },
]);
const cur = computed(() => groups.value.flatMap((g) => g.items).find((f) => f.id === dataView.value) ?? groups.value[0]!.items[0]!);
</script>

<template>
  <dialog ref="dlg" class="legal data" aria-labelledby="data-title" @close="dataDialog = null" @click="onBackdrop">
    <template v-if="dataDialog">
      <div class="legal-head">
        <h2 id="data-title">{{ T('data_title') }}</h2>
        <button class="btn solid" type="button" @click="dataDialog = null">{{ T('legal_close') }}</button>
      </div>
      <div class="data-tabs" role="tablist" :aria-label="T('data_title')">
        <button id="dtab-export" type="button" role="tab" class="tab" :aria-selected="dataDialog === 'export'" aria-controls="dpan" @click="dataDialog = 'export'"><Icon n="download" />{{ T('nav_export') }}</button>
        <button id="dtab-import" type="button" role="tab" class="tab" :aria-selected="dataDialog === 'import'" aria-controls="dpan" @click="dataDialog = 'import'"><Icon n="upload" />{{ T('nav_import') }}</button>
      </div>
      <div id="dpan" class="data-body" role="tabpanel" :aria-labelledby="'dtab-' + dataDialog">
        <div v-if="dataDialog === 'export'" class="exp">
          <nav class="fmts" :aria-label="T('fmt_aria')">
            <template v-for="g in groups" :key="g.title">
              <h3>{{ g.title }}</h3>
              <button v-for="f in g.items" :key="f.id" type="button" class="fmt" :aria-pressed="cur.id === f.id" @click="dataView = f.id; if (isExportLocked(f.id, project.limits)) track('export_locked')">{{ T('fmt_' + f.id) }}<span v-if="isExportLocked(f.id, project.limits)" class="lock"> · {{ T('lim_account') }}</span></button>
            </template>
          </nav>
          <section class="fmt-detail" :aria-label="T('fmt_' + cur.id)">
            <h3>{{ T('fmt_' + cur.id) }}</h3>
            <p class="hint">{{ T('desc_' + cur.id) }}</p>
            <div v-if="locked" class="locked" role="status">
              <p>{{ T('lim_export_locked') }}</p>
              <button class="btn solid on" type="button" @click="signup">{{ T('lim_cta') }}</button>
            </div>
            <template v-else>

            <fieldset v-if="cur.pick" class="pick">
              <legend>{{ T('pick_legend') }}</legend>
              <div class="pick-list">
                <label v-for="g in project.project.grafcets" :key="g.id"><input type="checkbox" :checked="!ui.exportExcluded.includes(g.id)" @change="ui.toggleExport(g.id, ($event.target as HTMLInputElement).checked)" /> {{ g.name }}</label>
              </div>
              <div class="row">
                <button class="btn solid" type="button" :disabled="ui.exportAll" @click="ui.selectExport(true)">{{ T('pick_all') }}</button>
                <button class="btn solid" type="button" :disabled="!ui.exportGrafcets.length" @click="ui.selectExport(false)">{{ T('pick_none') }}</button>
                <span class="msg" role="status">{{ T('pick_count', { n: ui.exportGrafcets.length, t: project.project.grafcets.length }) }}</span>
              </div>
              <p v-if="!ui.exportAll && ui.exportGrafcets.length && !cur.image" class="hint">{{ T('scope_hint') }}</p>
            </fieldset>

            <pre v-if="cur.text" class="code" tabindex="0" :aria-label="T('data_aria')">{{ dataText }}</pre>
            <div v-else-if="cur.image && ui.previewSvg" class="preview" role="img" :aria-label="T('preview_aria')" v-html="ui.previewSvg"></div>

            <div v-if="cur.id !== 'share'" class="row">
              <button v-if="cur.text" class="btn solid" type="button" @click="ui.copyData()"><Icon n="copy" />{{ T('copy') }}</button>
              <button v-if="cur.id === 'native'" class="btn solid on" type="button" :disabled="!ui.exportGrafcets.length" @click="ui.downloadNative()"><Icon n="download" />{{ T('download') }}</button>
              <button v-else-if="cur.id === 'sfcedit'" class="btn solid on" type="button" :disabled="!ui.exportGrafcets.length" @click="ui.downloadSfcEdit()"><Icon n="download" />{{ T('download') }}</button>
              <button v-else-if="cur.id === 'plcopen'" class="btn solid on" type="button" :disabled="!ui.exportGrafcets.length" @click="ui.downloadPlcopen()"><Icon n="download" />{{ T('download') }}</button>
              <button v-else-if="cur.id === 'zip'" class="btn solid on" type="button" @click="ui.downloadArchive()"><Icon n="download" />{{ T('download') }}</button>
              <button v-else-if="cur.id === 'folder'" class="btn solid on" type="button" @click="ui.saveFolder()"><Icon n="download" />{{ T('save_folder') }}</button>
              <button v-else-if="cur.id === 'svg'" class="btn solid on" type="button" :disabled="!ui.exportGrafcets.length" @click="ui.downloadSvg()"><Icon n="download" />{{ T('download') }}</button>
              <button v-else-if="cur.id === 'png'" class="btn solid on" type="button" :disabled="!ui.exportGrafcets.length" @click="ui.downloadPng()"><Icon n="download" />{{ T('download') }}</button>
              <button v-else-if="cur.id === 'pdf'" class="btn solid on" type="button" :disabled="!ui.exportGrafcets.length" @click="ui.printPdf()"><Icon n="download" />{{ T('dl_pdf') }}</button>
              <span class="msg" :class="copyMsg.cls" role="status">{{ copyMsg.text }}</span>
            </div>
            <ul v-if="exportReport.length && (cur.id === 'sfcedit' || cur.id === 'plcopen')" class="report" :aria-label="T('report_aria')">
              <li v-for="(r, i) in exportReport" :key="i" :class="r.level"><strong>{{ T('lvl_' + r.level) }}</strong> {{ r.text }}</li>
            </ul>

            <template v-if="cur.id === 'share'">
              <p v-if="!share.enabled" class="msg warn" role="status">{{ T('share_unavailable') }}</p>
              <template v-else>
              <p class="hint">{{ T('share_hint') }}</p>
              <div class="row"><button class="btn solid on" type="button" @click="share.openPublish()"><Icon n="copy" />{{ T('share_btn') }}</button></div>
              <ul v-if="share.entries.length" class="report" :aria-label="T('share_list_aria')">
                <li v-for="e in share.entries" :key="e.id">
                  <a :href="shareLink(e.id)">{{ e.name || e.id }}</a> — {{ T('share_expires', { d: new Date(e.expiresAt).toLocaleDateString() }) }}
                  <button class="btn solid" type="button" @click="share.remove(e.id)">{{ T('share_remove') }}</button>
                </li>
              </ul>
              </template>
            </template>
            </template>
          </section>
        </div>

        <div v-else class="imp-sec">
          <p class="hint">{{ T('import_hint') }}</p>
          <label class="sr" for="imp">{{ T('import_label') }}</label>
          <textarea id="imp" v-model="importText" class="imp" spellcheck="false" placeholder='{ "name": "…", "grafcets": [ … ] }'></textarea>
          <div class="row">
            <button class="btn solid on" :disabled="!importText.trim()" @click="ui.applyImport()">{{ T('import_btn') }}</button>
            <label class="btn solid" for="imp-file" style="cursor: pointer">{{ T('open_file') }}</label>
            <button v-if="ui.canFolder" class="btn solid" @click="ui.openFolder()">{{ T('open_folder') }}</button>
            <input id="imp-file" class="sr" type="file" accept=".json,.xml,.zip,application/json,application/xml,text/xml,application/zip" @change="ui.onFile" />
          </div>
          <p class="msg" :class="importMsg.cls" role="status">{{ importMsg.text }}</p>
          <ul v-if="importReport.length" class="report" :aria-label="T('report_aria')">
            <li v-for="(r, i) in importReport" :key="i" :class="r.level"><strong>{{ T('lvl_' + r.level) }}</strong> {{ r.text }}</li>
          </ul>
        </div>
      </div>
    </template>
  </dialog>
</template>
