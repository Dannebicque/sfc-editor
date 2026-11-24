import { IndexeddbPersistence } from 'y-indexeddb';
import type * as Y from 'yjs';

/**
 * Copie locale d'un projet en ligne (ADR 0005) : les modifications faites hors ligne survivent à la fermeture de l'onglet et sont
 * renvoyées à la prochaine ouverture du projet en ligne (Yjs fusionne). La base est propre à chaque compte (l'identifiant du compte
 * est dans le nom) et tout est effacé à la déconnexion ou à la suppression du compte.
 */
const PREFIX = 'grafcet-studio-collab-';
const name = (userId: string, projectId: string): string => `${PREFIX}${userId}-${projectId}`;

export const offlineSupported = (): boolean => typeof indexedDB !== 'undefined';

/** Relie `doc` à sa copie locale ; la promesse se résout quand l'état local est chargé dans `doc` (on peut alors se connecter). */
export function attach(userId: string, projectId: string, doc: Y.Doc): { loaded: Promise<void>; destroy(): Promise<void> } {
  if (!offlineSupported()) return { loaded: Promise.resolve(), destroy: async () => undefined };
  let p: IndexeddbPersistence;
  try { p = new IndexeddbPersistence(name(userId, projectId), doc); } catch { return { loaded: Promise.resolve(), destroy: async () => undefined }; }
  // Si la base est inutilisable (navigation privée, quota), on continue sans copie locale.
  const loaded = Promise.race([p.whenSynced.then(() => undefined), new Promise<void>((r) => setTimeout(r, 3000))]).catch(() => undefined);
  return { loaded, destroy: async () => { try { await p.destroy(); } catch { /* ignoré */ } } };
}

function drop(dbName: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const r = indexedDB.deleteDatabase(dbName);
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    } catch { resolve(); }
  });
}

/** Efface la copie locale d'un projet (droit retiré, projet supprimé, état à recharger, fermeture sans modification en attente). */
export async function clearProject(userId: string, projectId: string): Promise<void> {
  if (offlineSupported()) await drop(name(userId, projectId));
}

/** Efface toutes les copies locales (déconnexion, suppression du compte). */
export async function clearAll(): Promise<void> {
  if (!offlineSupported()) return;
  try {
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(dbs.filter((d) => d.name?.startsWith(PREFIX)).map((d) => drop(d.name!)));
  } catch { /* ignoré */ }
}
