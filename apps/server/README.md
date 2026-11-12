# Serveur de partage par lien

Voir l'[ADR 0004](../../docs/adr/0004-partage-par-lien.md). Aucune base de données : un fichier JSON par partage dans `DATA_DIR`.

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
