<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { T } from '../i18n';
import { useUiStore } from '../stores/ui';
import { shareLink } from '../share';
import { useShareStore } from '../stores/share';
import Icon from './Icon.vue';

const ui = useUiStore();
const share = useShareStore();
const { dataView, dataText, copyMsg, importMsg, importText, importReport, exportReport } = storeToRefs(ui);
</script>

<template>
  <div id="pan-data" class="panel" role="tabpanel" aria-labelledby="tab-data">
    <h2>{{ T('data_title') }}</h2>
    <div class="seg" role="group" :aria-label="T('fmt_aria')">
      <button :aria-pressed="dataView === 'json'" @click="dataView = 'json'">{{ T('fmt_json') }}</button>
      <button :aria-pressed="dataView === 'graph'" @click="dataView = 'graph'">{{ T('fmt_graph') }}</button>
      <button :aria-pressed="dataView === 'native'" @click="dataView = 'native'">{{ T('fmt_native') }}</button>
      <button :aria-pressed="dataView === 'sfcedit'" @click="dataView = 'sfcedit'">{{ T('fmt_sfcedit') }}</button>
      <button :aria-pressed="dataView === 'plcopen'" @click="dataView = 'plcopen'">{{ T('fmt_plcopen') }}</button>
    </div>
    <pre class="code" tabindex="0" :aria-label="T('data_aria')">{{ dataText }}</pre>
    <div class="row">
      <button class="btn solid" @click="ui.copyData()"><Icon n="copy" />{{ T('copy') }}</button>
      <button class="btn solid" @click="ui.downloadNative()"><Icon n="download" />{{ T('download') }}</button>
      <button class="btn solid" @click="ui.downloadSfcEdit()"><Icon n="download" />{{ T('download_sfcedit') }}</button>
      <button class="btn solid" @click="ui.downloadPlcopen()"><Icon n="download" />{{ T('download_plcopen') }}</button>
      <button class="btn solid" @click="ui.downloadArchive()"><Icon n="download" />{{ T('download_zip') }}</button>
      <button v-if="ui.canFolder" class="btn solid" @click="ui.saveFolder()"><Icon n="download" />{{ T('save_folder') }}</button>
      <span class="msg" :class="copyMsg.cls" role="status">{{ copyMsg.text }}</span>
    </div>
    <ul v-if="exportReport.length" class="report" :aria-label="T('report_aria')">
      <li v-for="(r, i) in exportReport" :key="i" :class="r.level"><strong>{{ T('lvl_' + r.level) }}</strong> {{ r.text }}</li>
    </ul>
    <template v-if="share.enabled">
      <h3>{{ T('share_h') }}</h3>
      <p class="hint">{{ T('share_hint') }}</p>
      <div class="row"><button class="btn solid" type="button" @click="share.openPublish()"><Icon n="copy" />{{ T('share_btn') }}</button></div>
      <ul v-if="share.entries.length" class="report" :aria-label="T('share_list_aria')">
        <li v-for="e in share.entries" :key="e.id">
          <a :href="shareLink(e.id)">{{ e.name || e.id }}</a> — {{ T('share_expires', { d: new Date(e.expiresAt).toLocaleDateString() }) }}
          <button class="btn solid" type="button" @click="share.remove(e.id)">{{ T('share_remove') }}</button>
        </li>
      </ul>
    </template>
    <h3>{{ T('h_import') }}</h3>
    <p class="hint">{{ T('import_hint') }}</p>
    <label class="sr" for="imp">{{ T('import_label') }}</label>
    <textarea id="imp" v-model="importText" class="imp" spellcheck="false" placeholder='{ "name": "…", "grafcets": [ … ] }'></textarea>
    <div class="row">
      <button class="btn solid" :disabled="!importText.trim()" @click="ui.applyImport()">{{ T('import_btn') }}</button>
      <label class="btn solid" for="imp-file" style="cursor: pointer">{{ T('open_file') }}</label>
      <button v-if="ui.canFolder" class="btn solid" @click="ui.openFolder()">{{ T('open_folder') }}</button>
      <input id="imp-file" class="sr" type="file" accept=".json,.xml,.zip,application/json,application/xml,text/xml,application/zip" @change="ui.onFile" />
    </div>
    <p class="msg" :class="importMsg.cls" role="status">{{ importMsg.text }}</p>
    <ul v-if="importReport.length" class="report" :aria-label="T('report_aria')">
      <li v-for="(r, i) in importReport" :key="i" :class="r.level"><strong>{{ T('lvl_' + r.level) }}</strong> {{ r.text }}</li>
    </ul>
  </div>
</template>
