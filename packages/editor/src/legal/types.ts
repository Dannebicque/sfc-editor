/** Un document juridique : titre, puis une suite de blocs. Le texte peut contenir des jetons {contact}, {publisher}… */
export type LegalBlock =
  | { h: string }
  | { p: string }
  | { ul: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { a: { label: string; href: string } };

export interface LegalDoc {
  id: LegalDocId;
  title: string;
  blocks: LegalBlock[];
}

export const LEGAL_DOC_IDS = ['mentions', 'privacy', 'cookies', 'terms', 'licence'] as const;
export type LegalDocId = (typeof LEGAL_DOC_IDS)[number];

export const isLegalDocId = (s: string): s is LegalDocId => (LEGAL_DOC_IDS as readonly string[]).includes(s);
