import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { buildServer } from '../src/server';
import { FileStore } from '../src/store';

let server: ReturnType<typeof buildServer>, base: string;
beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'static-'));
  const dist = join(root, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  mkdirSync(join(dist, 'app'), { recursive: true });
  mkdirSync(join(dist, 'en'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>landing-fr</title>');
  writeFileSync(join(dist, 'en', 'index.html'), '<!doctype html><title>landing-en</title>');
  writeFileSync(join(dist, 'app', 'index.html'), '<!doctype html><title>editor</title>');
  writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');
  writeFileSync(join(root, 'secret.txt'), 'secret');
  server = buildServer({ shares: createApp({ store: new FileStore(join(root, 'shares')) }), staticDir: dist });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.closeAllConnections(); server.close(); });

describe('éditeur servi par le serveur', () => {
  it('sert la landing à la racine, la landing anglaise sous /en/ et l\'éditeur sous /app/', async () => {
    const cases: [string, string][] = [['/', 'landing-fr'], ['/en/', 'landing-en'], ['/app/', 'editor'], ['/app/projets/abc', 'editor'], ['/en/x', 'landing-en'], ['/inconnue', 'landing-fr']];
    for (const [p, title] of cases) {
      const r = await fetch(base + p);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toContain('text/html');
      expect(r.headers.get('cache-control')).toBe('no-cache');
      expect(await r.text()).toContain(title);
    }
  });
  it('ajoute la barre finale à /app et /en (leurs liens sont relatifs)', async () => {
    for (const p of ['/app', '/en']) {
      const r = await fetch(base + p + '?x=1', { redirect: 'manual' });
      expect(r.status).toBe(301);
      expect(r.headers.get('location')).toBe(p + '/?x=1');
    }
  });
  it('sert les fichiers à nom haché avec un cache long, et le bon type', async () => {
    const r = await fetch(base + '/assets/app-abc123.js');
    expect(r.headers.get('content-type')).toContain('javascript');
    expect(r.headers.get('cache-control')).toContain('immutable');
  });
  it('répond 404 pour un fichier absent (pas de repli sur index.html) et refuse de sortir du dossier', async () => {
    expect((await fetch(base + '/assets/absent.js')).status).toBe(404);
    expect((await fetch(base + '/%2e%2e/secret.txt')).status).toBe(404);
    expect((await fetch(base + '/..%2fsecret.txt')).status).toBe(404);
  });
  it('n\'intercepte pas l\'API', async () => {
    expect(await (await fetch(base + '/api/health')).json()).toEqual({ ok: true });
    expect((await fetch(base + '/api/inconnu')).status).toBe(404);
  });
});
