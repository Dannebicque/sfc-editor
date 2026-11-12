import { describe, expect, it } from 'vitest';
import { createShare, deleteShare, fetchShare, idFromHash, ShareError, shareLink } from '../src/share';

const ID = 'AbCdEfGhIjKlMnOpQrStUv';
const res = (status: number, body: unknown = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

describe('client de partage', () => {
  it('reconnaît #/s/<id> et refuse tout le reste', () => {
    expect(idFromHash('#/s/' + ID)).toBe(ID);
    for (const h of ['', '#/legal/terms', '#/s/court', '#/s/' + ID + '/x', '#/s/' + 'é'.repeat(22)]) expect(idFromHash(h)).toBeNull();
  });
  it('compose un lien vers l\'éditeur, identifiant dans le fragment', () => {
    expect(shareLink(ID, { origin: 'https://ed.example', pathname: '/app/' })).toBe(`https://ed.example/app/#/s/${ID}`);
  });
  it('publie en JSON, sans cookies ni référent', async () => {
    let seen: RequestInit | undefined, url = '';
    const f = (async (u: string, i: RequestInit) => { url = u; seen = i; return res(201, { id: ID, deleteToken: 't'.repeat(32), expiresAt: '2030-01-01T00:00:00Z' }); }) as unknown as typeof fetch;
    const r = await createShare('https://s.example', '{"a":1}', f);
    expect(r.id).toBe(ID);
    expect(url).toBe('https://s.example/api/shares');
    expect(seen).toMatchObject({ method: 'POST', body: '{"a":1}', credentials: 'omit', referrerPolicy: 'no-referrer' });
  });
  it('traduit les statuts HTTP en codes d\'erreur', async () => {
    const code = async (status: number) => { try { await fetchShare('https://s', ID, (async () => res(status)) as unknown as typeof fetch); return 'ok'; } catch (e) { return (e as ShareError).code; } };
    expect(await code(404)).toBe('not_found');
    expect(await code(429)).toBe('rate_limit');
    expect(await code(413)).toBe('too_large');
    expect(await code(400)).toBe('invalid');
    expect(await code(500)).toBe('server');
    const down = (async () => { throw new TypeError('x'); }) as unknown as typeof fetch;
    await expect(fetchShare('https://s', ID, down)).rejects.toMatchObject({ code: 'network' });
  });
  it('n\'appelle pas le serveur pour un identifiant mal formé', async () => {
    let called = false;
    await expect(fetchShare('https://s', '../x', (async () => { called = true; return res(200); }) as unknown as typeof fetch)).rejects.toMatchObject({ code: 'not_found' });
    expect(called).toBe(false);
  });
  it('supprime avec le jeton en Bearer', async () => {
    let auth = '';
    await deleteShare('https://s', ID, 'jeton', (async (_u: string, i: RequestInit) => { auth = (i.headers as Record<string, string>).Authorization!; return res(204); }) as unknown as typeof fetch);
    expect(auth).toBe('Bearer jeton');
  });
  it('rejette une réponse de création incomplète', async () => {
    await expect(createShare('https://s', '{}', (async () => res(201, { id: 'x' })) as unknown as typeof fetch)).rejects.toMatchObject({ code: 'server' });
  });
});
