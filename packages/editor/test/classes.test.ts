import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { setFetch } from '../src/api';
import { applyLang } from '../src/i18n';
import { parseStudents, useClassesStore } from '../src/stores/classes';

beforeEach(() => { applyLang('fr'); setActivePinia(createPinia()); });

describe('parseStudents', () => {
  it('lit « nom, email », dans les deux ordres, avec virgule, point-virgule ou tabulation', () => {
    const r = parseStudents('Léa Martin, lea@ex.fr\ntom@ex.fr;Tom Durand\nZoé\tzoe@ex.fr\n');
    expect(r).toEqual({ students: [{ name: 'Léa Martin', email: 'lea@ex.fr' }, { name: 'Tom Durand', email: 'tom@ex.fr' }, { name: 'Zoé', email: 'zoe@ex.fr' }], bad: 0 });
  });
  it('ignore un en-tête de colonnes, mais compte les autres lignes incomprises', () => {
    expect(parseStudents('Nom;Email\nA;a@ex.fr')).toEqual({ students: [{ name: 'A', email: 'a@ex.fr' }], bad: 0 });
    expect(parseStudents('A;a@ex.fr\nsans adresse\nb@ex.fr')).toEqual({ students: [{ name: 'A', email: 'a@ex.fr' }], bad: 2 });
  });
  it('accepte les guillemets d\'un export CSV', () => {
    expect(parseStudents('"Martin Léa","lea@ex.fr"').students).toEqual([{ name: 'Martin Léa', email: 'lea@ex.fr' }]);
  });
});

describe('store des classes', () => {
  it('n\'envoie rien si la liste est mal formée, puis envoie la liste et affiche le compte rendu', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    setFetch((async (url: string, init: RequestInit) => {
      calls.push({ method: init.method!, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
      if (init.method === 'POST' && url.endsWith('/students')) return json({ results: [{ email: 'a@ex.fr', status: 'created' }] });
      return json({ role: 'teacher', id: 'c1', name: 'C', students: [], invites: [], assignments: [] });
    }) as typeof fetch);
    const s = useClassesStore();
    s.cls = { role: 'teacher', id: 'c1', name: 'C', students: [], invites: [], assignments: [] };
    expect(await s.importStudents('A;a@ex.fr\nn\'importe quoi')).toBe(false);
    expect(s.error).toMatch(/non comprise/);
    expect(calls).toHaveLength(0);
    expect(await s.importStudents('A;a@ex.fr')).toBe(true);
    expect(calls[0]).toEqual({ method: 'POST', url: '/api/classes/c1/students', body: { students: [{ name: 'A', email: 'a@ex.fr' }] } });
    expect(s.importResult).toEqual([{ email: 'a@ex.fr', status: 'created' }]);
  });
});
