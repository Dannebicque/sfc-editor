import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { attach, clearAll, clearProject } from '../src/collab/offline';

const text = (d: Y.Doc): string => d.getMap<string>('m').get('k') ?? '';
async function session(user: string, project: string, write?: string): Promise<string> {
  const doc = new Y.Doc();
  const l = attach(user, project, doc);
  await l.loaded;
  const seen = text(doc);
  if (write !== undefined) { doc.getMap<string>('m').set('k', write); await new Promise((r) => setTimeout(r, 50)); }
  await l.destroy();
  return seen;
}

describe('copie locale hors ligne', () => {
  it('retrouve les modifications non envoyées à la prochaine ouverture', async () => {
    expect(await session('u1', 'p1', 'travail hors ligne')).toBe('');
    expect(await session('u1', 'p1')).toBe('travail hors ligne');
  });
  it('est propre à chaque compte et à chaque projet', async () => {
    await session('u1', 'p2', 'secret');
    expect(await session('u2', 'p2')).toBe('');
    expect(await session('u1', 'p3')).toBe('');
  });
  it('s’efface pour un projet, puis pour tout le monde (déconnexion)', async () => {
    await session('u1', 'p4', 'a');
    await session('u1', 'p5', 'b');
    await clearProject('u1', 'p4');
    expect(await session('u1', 'p4')).toBe('');
    expect(await session('u1', 'p5')).toBe('b');
    await clearAll();
    expect(await session('u1', 'p5')).toBe('');
  });
});
