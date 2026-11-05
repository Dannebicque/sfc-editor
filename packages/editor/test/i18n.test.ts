import { describe, expect, it } from 'vitest';
import en from '../src/locales/en.json';
import fr from '../src/locales/fr.json';
import { applyLang, T } from '../src/i18n';
import { describeText, issueText, renderMessage } from '../src/format';

describe('dictionnaires', () => {
  it('fr et en ont exactement les mêmes clés', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });
  it('chaque message a les mêmes paramètres dans les deux langues', () => {
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(fr) as (keyof typeof fr)[]) expect(params(en[k]), k).toEqual(params(fr[k]));
  });
  it('rend tous les messages sans accolade ni barre résiduelles', () => {
    for (const l of ['fr', 'en'] as const) {
      applyLang(l);
      for (const k of Object.keys(fr)) {
        for (const n of [1, 2]) {
          const out = T(k, { n, s: 1, t: 1, k: 'x', v: 'x', e: 'x', g: 'x', m: 'x', d: 'x', list: 'x', x: 'x', i: 1 });
          expect(out, `${l}:${k}`).not.toMatch(/[{}]|\s\|\s/);
        }
      }
    }
  });
  it('accorde le pluriel comme le prototype (1 = singulier, sinon pluriel)', () => {
    applyLang('fr');
    expect(T('n_steps', { n: 1 })).toBe('1 étape');
    expect(T('n_steps', { n: 3 })).toBe('3 étapes');
    applyLang('en');
    expect(T('n_errors', { n: 1 })).toBe('1 error');
    expect(T('n_errors', { n: 0 })).toBe('0 errors');
  });
});

describe('messages du noyau', () => {
  it('rend un message imbriqué avec sa position', () => {
    applyLang('fr');
    expect(renderMessage({ key: 'p_char', params: { c: '#' }, pos: 4 })).toMatch(/#.*5/);
  });
  it('rend un problème de validation et une description', () => {
    applyLang('en');
    expect(issueText({ level: 'error', key: 'v_noinit', id: null })).toMatch(/initial/i);
    expect(describeText({ key: 'd_step', params: { n: 2 }, name: 'Attente', initial: true })).toMatch(/Step 2 · Attente/);
    expect(describeText({ key: 'div_or', branches: 2 })).toMatch(/2 branches/);
  });
});
