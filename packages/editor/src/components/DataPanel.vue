<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { T } from '../i18n';
import { useUiStore } from '../stores/ui';
import Icon from './Icon.vue';

const ui = useUiStore();
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
    </div>
    <pre class="code" tabindex="0" :aria-label="T('data_aria')">{{ dataText }}</pre>
    <div class="row">
      <button class="btn solid" @click="ui.copyData()"><Icon n="copy" />{{ T('copy') }}</button>
      <button class="btn solid" @click="ui.downloadNative()"><Icon n="download" />{{ T('download') }}</button>
      <button class="btn solid" @click="ui.downloadSfcEdit()"><Icon n="download" />{{ T('download_sfcedit') }}</button>
      <span class="msg" :class="copyMsg.cls" role="status">{{ copyMsg.text }}</span>
    </div>
    <ul v-if="exportReport.length" class="report" :aria-label="T('report_aria')">
      <li v-for="(r, i) in exportReport" :key="i" :class="r.level"><strong>{{ T('lvl_' + r.level) }}</strong> {{ r.text }}</li>
    </ul>
    <h3>{{ T('h_import') }}</h3>
    <p class="hint">{{ T('import_hint') }}</p>
    <label class="sr" for="imp">{{ T('import_label') }}</label>
    <textarea id="imp" v-model="importText" class="imp" spellcheck="false" placeholder='{ "name": "…", "grafcets": [ … ] }'></textarea>
    <div class="row">
      <button class="btn solid" :disabled="!importText.trim()" @click="ui.applyImport()">{{ T('import_btn') }}</button>
      <label class="btn solid" for="imp-file" style="cursor: pointer">{{ T('open_file') }}</label>
      <input id="imp-file" class="sr" type="file" accept=".json,.xml,application/json,application/xml,text/xml" @change="ui.onFile" />
    </div>
    <p class="msg" :class="importMsg.cls" role="status">{{ importMsg.text }}</p>
    <ul v-if="importReport.length" class="report" :aria-label="T('report_aria')">
      <li v-for="(r, i) in importReport" :key="i" :class="r.level"><strong>{{ T('lvl_' + r.level) }}</strong> {{ r.text }}</li>
    </ul>
  </div>
</template>
