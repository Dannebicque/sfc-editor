import { XMLParser } from 'fast-xml-parser';

/** Nœud XML simplifié : balise, attributs, enfants dans l'ordre du document (éléments ou texte). */
export interface XNode {
  tag: string;
  attrs: Record<string, string>;
  children: (XNode | string)[];
}

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
});

type Raw = Record<string, unknown>;

function convert(list: Raw[]): (XNode | string)[] {
  const out: (XNode | string)[] = [];
  for (const item of list) {
    for (const key of Object.keys(item)) {
      if (key === ':@') continue;
      if (key === '#text') { out.push(String(item[key])); continue; }
      const attrsRaw = (item[':@'] ?? {}) as Record<string, string>;
      const attrs: Record<string, string> = {};
      for (const [k, v] of Object.entries(attrsRaw)) attrs[k.replace(/^@_/, '')] = String(v);
      out.push({ tag: key, attrs, children: convert(item[key] as Raw[]) });
    }
  }
  return out;
}

/** Analyse un document XML (sans résolution d'entités externes) et renvoie l'élément racine. */
export function parseXml(text: string): XNode {
  const roots = convert(parser.parse(text) as Raw[]).filter((n): n is XNode => typeof n !== 'string');
  if (roots.length !== 1) throw new Error('document XML sans élément racine unique');
  return roots[0]!;
}

export const elements = (n: XNode, tag?: string): XNode[] =>
  n.children.filter((c): c is XNode => typeof c !== 'string' && (!tag || c.tag === tag));

/** Texte brut d'un nœud (concaténation de tous les textes descendants). */
export const textOf = (n: XNode): string =>
  n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
