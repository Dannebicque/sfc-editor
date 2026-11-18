import type { Db } from './db';

/**
 * Événements comptés. Côté serveur : `register`, `verify`, `project_created`, `invite_sent`, `collab_session`, `waitlist`.
 * Côté navigateur (balise anonyme sur `/api/usage`) : ceux de `CLIENT_EVENTS`. Liste fermée : rien d'autre n'est accepté.
 */
export const CLIENT_EVENTS = ['guest_session', 'limit_grafcets', 'limit_steps', 'limit_cta', 'export_locked', 'landing_try', 'landing_account'] as const;
export const SERVER_EVENTS = ['register', 'verify', 'project_created', 'invite_sent', 'collab_session', 'waitlist'] as const;
export type UsageEvent = (typeof CLIENT_EVENTS)[number] | (typeof SERVER_EVENTS)[number];

export const isClientEvent = (e: unknown): e is (typeof CLIENT_EVENTS)[number] => typeof e === 'string' && (CLIENT_EVENTS as readonly string[]).includes(e);
const dayOf = (t: number): string => new Date(t).toISOString().slice(0, 10);

/** Incrémente le compteur du jour. Ne lève jamais : une statistique ne doit pas faire échouer une requête. */
export function track(db: Db, event: UsageEvent, now: number = Date.now()): void {
  try {
    db.prepare('INSERT INTO usage_daily (day, event, n) VALUES (?, ?, 1) ON CONFLICT (day, event) DO UPDATE SET n = n + 1').run(dayOf(now), event);
  } catch { /* ignoré */ }
}

/** Totaux par événement sur les `days` derniers jours (par défaut 30), plus la taille de la liste d'attente par type. */
export function stats(db: Db, now: number = Date.now(), days = 30): { since: string; events: Record<string, number>; waitlist: Record<string, number> } {
  const since = dayOf(now - (days - 1) * 86_400_000);
  const events: Record<string, number> = {};
  for (const r of db.prepare('SELECT event, SUM(n) AS n FROM usage_daily WHERE day >= ? GROUP BY event ORDER BY event').all(since) as Array<{ event: string; n: number }>) events[r.event] = r.n;
  const waitlist: Record<string, number> = {};
  for (const r of db.prepare('SELECT kind, COUNT(*) AS n FROM waitlist GROUP BY kind').all() as Array<{ kind: string; n: number }>) waitlist[r.kind] = r.n;
  return { since, events, waitlist };
}
