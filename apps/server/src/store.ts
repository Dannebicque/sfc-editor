import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ShareRecord {
  id: string;
  createdAt: number;
  expiresAt: number;
  /** Empreinte SHA-256 (hex) du jeton de suppression : le jeton lui-même n'est jamais conservé. */
  tokenHash: string;
  /** Document natif canonique (JSON). */
  document: string;
}

/** Stockage des partages. Un SGBD pourra remplacer l'implémentation fichier sans toucher à l'API. */
export interface ShareStore {
  put(r: ShareRecord): Promise<void>;
  get(id: string): Promise<ShareRecord | null>;
  delete(id: string): Promise<boolean>;
  /** Supprime les partages échus ; renvoie leur nombre. */
  sweep(now: number): Promise<number>;
}

export const ID_RE = /^[A-Za-z0-9_-]{22}$/;

/** Un fichier JSON par partage. Écriture atomique (fichier temporaire puis renommage). */
export class FileStore implements ShareStore {
  constructor(private dir: string) {}
  private file(id: string): string {
    if (!ID_RE.test(id)) throw new Error('identifiant invalide');
    return join(this.dir, id + '.json');
  }
  async put(r: ShareRecord): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const f = this.file(r.id), tmp = f + '.' + process.pid + '.tmp';
    await writeFile(tmp, JSON.stringify(r), { mode: 0o600 });
    await rename(tmp, f);
  }
  async get(id: string): Promise<ShareRecord | null> {
    if (!ID_RE.test(id)) return null;
    try { return JSON.parse(await readFile(this.file(id), 'utf8')) as ShareRecord; } catch { return null; }
  }
  async delete(id: string): Promise<boolean> {
    if (!ID_RE.test(id)) return false;
    try { await rm(this.file(id)); return true; } catch { return false; }
  }
  async sweep(now: number): Promise<number> {
    let n = 0;
    let names: string[];
    try { names = await readdir(this.dir); } catch { return 0; }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const id = name.slice(0, -5);
      const r = await this.get(id);
      if (!r || r.expiresAt <= now) { if (await this.delete(id)) n++; }
    }
    return n;
  }
}
