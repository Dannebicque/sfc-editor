import { createPinia } from 'pinia';
import { createApp, type App as VueApp } from 'vue';
import App from './App.vue';
import { i18n, initLang } from './i18n';
import './styles/app.css';

export { default as EditorApp } from './App.vue';
export { i18n, T } from './i18n';

/** Monte l'éditeur dans `target`. Utilisé par l'application web (et, plus tard, par le shell Electron). */
export function mountEditor(target: string | Element): VueApp {
  initLang();
  const app = createApp(App).use(createPinia()).use(i18n);
  app.mount(target);
  return app;
}
