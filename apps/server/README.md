# Serveur : partage par lien, comptes et co-édition

Voir l'[ADR 0004](../../docs/adr/0004-partage-par-lien.md) (partage par lien : un fichier JSON par partage dans `DATA_DIR`) et l'[ADR 0005](../../docs/adr/0005-comptes-et-co-edition.md)
(comptes, projets, rôles, co-édition : SQLite via `node:sqlite`, activés seulement si `PUBLIC_URL` est définie). Déploiement : [docs/deploiement.md](../../docs/deploiement.md).

| Route | Rôle |
|---|---|
| `POST /api/auth/register · login · logout · verify · resend · forgot · reset` | Comptes et sessions (cookie `HttpOnly`) |
| `GET·PATCH·DELETE /api/me`, `POST /api/me/password`, `GET /api/me/export` | Mon compte, droits RGPD |
| `GET·POST /api/projects`, `GET·DELETE /api/projects/:id` | Projets en ligne |
| `GET /api/projects/:id/members`, `PUT·DELETE …/members/:userId`, `POST …/invites`, `DELETE …/invites/:id`, `POST …/transfer` | Rôles et invitations |
| `POST·DELETE /api/invitations/:id` | Accepter ou refuser une invitation |
| `WS /ws/projects/:id` | Co-édition (Yjs : synchronisation + présence), rôle contrôlé côté serveur |

```bash
pnpm --filter @grafcet/server start      # écoute sur 127.0.0.1:8787
pnpm --filter @grafcet/server test
```

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` / `HOST` | `8787` / `127.0.0.1` | Adresse d'écoute (mettre un reverse proxy TLS devant). |
| `DATA_DIR` | `./data` | Dossier des partages (à sauvegarder par copie). |
| `TTL_DAYS` | `90` | Durée de vie d'un partage (1 à 365). |
| `MAX_BYTES` | `2000000` | Taille maximale d'un partage. |
| `RATE_PER_HOUR` | `20` | Créations par heure et par adresse IP (compteur en mémoire). |
| `ALLOWED_ORIGIN` | — | Origine de l'éditeur autorisée en CORS (jamais `*`). |
| `TRUST_PROXY` | — | `1` pour lire l'adresse du client dans `X-Forwarded-For` (derrière votre proxy seulement). |

À faire avant toute mise en service publique : compléter les textes légaux de l'éditeur (hébergeur, durée de conservation, contact),
puis construire l'éditeur avec `VITE_SHARE_URL=https://votre-serveur` : sans cette variable, le partage n'apparaît pas dans l'interface.
