import type { LegalConfig } from './config';

export type Segment = string | { todo: string };

const TOKENS = ['product', 'publisher', 'contact', 'publisherAddress', 'hostName', 'hostAddress', 'hostUrl', 'repo', 'updated'] as const;

/**
 * Remplace les jetons {contact}, {hostName}… par les valeurs de la configuration.
 * Une valeur vide devient un segment « à compléter » (affiché en évidence), jamais une valeur inventée.
 */
export function expand(text: string, cfg: LegalConfig, todoLabel: string, format?: (key: string, value: string) => string): Segment[] {
  const out: Segment[] = [];
  const re = new RegExp(`\\{(${TOKENS.join('|')})\\}`, 'g');
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = m[1] as (typeof TOKENS)[number];
    const v = cfg[key];
    out.push(v ? (format ? format(key, v) : v) : { todo: todoLabel });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Jetons encore vides dans la configuration (pour alerter avant une mise en ligne publique). */
export function missingFields(cfg: LegalConfig, usedIn: string[]): string[] {
  const used = new Set<string>();
  for (const t of usedIn) for (const m of t.matchAll(/\{(\w+)\}/g)) used.add(m[1]!);
  return TOKENS.filter((k) => used.has(k) && !cfg[k]);
}
