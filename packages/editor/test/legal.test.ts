import { SHARES_KEY } from '../src/share';
import { describe, expect, it } from 'vitest';
import { expand, LEGAL, LEGAL_DOC_IDS, LEGAL_DOCS, missingFields, type LegalBlock } from '../src/legal';

const texts = (blocks: LegalBlock[]): string[] =>
  blocks.flatMap((b) => ('p' in b ? [b.p] : 'ul' in b ? b.ul : 'a' in b ? [b.a.href] : []));
const shape = (blocks: LegalBlock[]) => blocks.map((b) => Object.keys(b)[0]);

describe('textes légaux', () => {
  it('existent dans les deux langues pour chaque document, avec la même structure', () => {
    for (const id of LEGAL_DOC_IDS) {
      const f = LEGAL_DOCS.fr.find((d) => d.id === id);
      const e = LEGAL_DOCS.en.find((d) => d.id === id);
      expect(f, `fr:${id}`).toBeTruthy();
      expect(e, `en:${id}`).toBeTruthy();
      expect(shape(e!.blocks), id).toEqual(shape(f!.blocks));
    }
  });
  it('n’emploient que des jetons connus', () => {
    for (const docs of Object.values(LEGAL_DOCS)) {
      for (const d of docs) {
        for (const t of texts(d.blocks)) {
          for (const m of t.matchAll(/\{(\w+)\}/g)) expect(Object.keys(LEGAL), `${d.id}:${m[1]}`).toContain(m[1]);
        }
      }
    }
  });
  it('listent dans la page cookies chaque clé de stockage réellement utilisée', () => {
    const cookies = LEGAL_DOCS.fr.find((d) => d.id === 'cookies')!;
    const table = cookies.blocks.find((b) => 'table' in b) as Extract<LegalBlock, { table: unknown }>;
    const keys = table.table.rows.map((r) => r[0]);
    expect(keys).toEqual(['grafcet-studio-v1', 'grafcet-studio-v1-lang', 'grafcet-studio-v1-theme', SHARES_KEY]);
    const en = (LEGAL_DOCS.en.find((d) => d.id === 'cookies')!.blocks.find((b) => 'table' in b) as Extract<LegalBlock, { table: unknown }>).table.rows.map((r) => r[0]);
    expect(en).toEqual(keys);
  });
});

describe('expand', () => {
  const cfg = { ...LEGAL, contact: 'a@b.fr', hostName: '' };
  it('remplace les jetons renseignés et marque les champs vides « à compléter »', () => {
    expect(expand('Écrire à {contact}, hébergé par {hostName}.', cfg, 'TODO')).toEqual(['Écrire à ', 'a@b.fr', ', hébergé par ', { todo: 'TODO' }, '.']);
  });
  it('liste les champs manquants réellement utilisés par les textes', () => {
    const all = Object.values(LEGAL_DOCS.fr).flatMap((d) => texts(d.blocks));
    const missing = missingFields({ ...LEGAL, contact: '' }, all);
    expect(missing).toContain('contact');
    expect(missing).not.toContain('publisher');
  });
});
