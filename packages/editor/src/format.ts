import type { Description, Issue, Message } from '@grafcet/core';
import { T } from './i18n';

/** Transforme un message du noyau (clé + paramètres, éventuellement imbriqués) en texte localisé. */
export function renderMessage(m: Message): string {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(m.params ?? {})) params[k] = typeof v === 'object' ? renderMessage(v) : v;
  const text = T(m.key, Object.keys(params).length ? params : undefined);
  return m.pos != null ? text + T('p_pos', { n: m.pos + 1 }) : text;
}

export const issueText = (i: Issue): string => renderMessage({ key: i.key, params: i.params });

export function describeText(d: Description | null): string {
  if (!d) return '';
  const base = T(d.key, d.params);
  if (d.key === 'd_step') return base + (d.name ? ' · ' + d.name : '') + (d.initial ? T('d_initial') : '');
  if (d.key === 'd_trans') return base + ' : ' + (d.recept ? d.recept : T('d_recept_empty'));
  if (d.branches != null) return base + ', ' + T('n_branches', { n: d.branches });
  return base;
}
