import { computed } from 'vue';
import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import fr from './locales/fr.json';

export type Lang = 'fr' | 'en';
export const LANGS: Lang[] = ['fr', 'en'];
export const LS_PREFIX = 'grafcet-studio-v1';

/** Les touches d'insertion suivent la langue (mnémoniques) : E T O A R en français, S T O A J en anglais. */
export type KeyName = 'step' | 'trans' | 'or' | 'and' | 'jump' | 'link';
export const KEYMAP: Record<Lang, Record<KeyName, string>> = {
  fr: { step: 'E', trans: 'T', or: 'O', and: 'A', jump: 'R', link: 'L' },
  en: { step: 'S', trans: 'T', or: 'O', and: 'A', jump: 'J', link: 'L' },
};

export const i18n = createI18n({
  legacy: false,
  locale: 'fr',
  fallbackLocale: 'fr',
  messages: { fr, en },
  missingWarn: false,
  fallbackWarn: false,
});

const g = i18n.global;

/** Traduit une clé. Si `params.n` est un nombre, il sert aussi à choisir le singulier ou le pluriel. */
export function T(key: string, params?: Record<string, string | number>): string {
  if (params && typeof params.n === 'number') return g.t(key, params, params.n);
  return params ? g.t(key, params) : g.t(key);
}

export const lang = computed<Lang>(() => g.locale.value as Lang);
export const keys = computed(() => KEYMAP[lang.value]);
export const kindLabel = (k: 'step' | 'trans') => T('k_' + k);

/** Langue initiale : choix mémorisé, sinon langue du navigateur. */
export function initLang(): Lang {
  let l: string | null = null;
  try { l = localStorage.getItem(LS_PREFIX + '-lang'); } catch { /* stockage indisponible */ }
  if (l !== 'fr' && l !== 'en') l = /^fr/i.test(navigator.language || 'fr') ? 'fr' : 'en';
  g.locale.value = l as Lang;
  document.documentElement.lang = l;
  return l as Lang;
}

export function applyLang(l: Lang): void {
  g.locale.value = l;
  document.documentElement.lang = l;
  try { localStorage.setItem(LS_PREFIX + '-lang', l); } catch { /* ignoré */ }
}
