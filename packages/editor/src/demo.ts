import { buildDemoProject, type DemoTexts, type Project } from '@grafcet/core';
import texts from './demo-texts.json';
import type { Lang } from './i18n';

const DEMO = texts as Record<Lang, DemoTexts>;

export const demoProject = (lang: Lang): Project => buildDemoProject(DEMO[lang] ?? DEMO.fr);

/** Un projet resté identique à l'exemple d'une langue est ré-généré dans l'autre : rien n'est perdu, tout est traduit. */
export function syncDemo(p: Project, lang: Lang): Project {
  try {
    const cur = JSON.stringify(p);
    for (const other of Object.keys(DEMO) as Lang[]) {
      if (other !== lang && cur === JSON.stringify(demoProject(other))) return demoProject(lang);
    }
  } catch { /* ignoré */ }
  return p;
}
