import { accountsEnabled, apiBase } from './api';

/**
 * Compteurs d'usage anonymes (`POST /api/usage`) : un nom d'événement, rien d'autre. Pas de cookie, pas d'identifiant, pas de contenu de projet.
 * Sans comptes (instance locale) ou sans serveur, ne fait rien. Une panne du serveur n'a aucun effet visible.
 */
export type ClientEvent = 'guest_session' | 'limit_grafcets' | 'limit_steps' | 'limit_cta' | 'export_locked';

export function track(event: ClientEvent): void {
  if (!accountsEnabled) return;
  try {
    void fetch(apiBase + '/api/usage', {
      method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }),
    }).catch(() => undefined);
  } catch { /* ignoré */ }
}
