# Déploiement auto-hébergé (comptes, co-édition, partage)

Une seule image fait tout : elle sert l'éditeur construit, l'API (`/api`) et le WebSocket de co-édition (`/ws`) sur **la même origine**.
Caddy se place devant pour le HTTPS (certificat automatique). La même origine évite CORS et permet des cookies `SameSite=Lax` sûrs.

## Mise en route
1. Un serveur avec Docker, un nom de domaine qui pointe dessus, les ports 80 et 443 ouverts.
2. `cp .env.example .env` puis renseigner `DOMAIN`, `PUBLIC_URL` et **`SMTP_URL`** (obligatoire : sans courrier, pas de vérification d'adresse,
   de mot de passe oublié ni d'invitation ; le serveur refuse de démarrer en production sans SMTP).
3. `docker compose up -d --build`
4. Ouvrir `https://<domaine>` ; créer le premier compte ; puis, si l'on veut une instance fermée, mettre `ALLOW_REGISTRATION=0`
   (seules les personnes invitées pourront alors créer un compte).

## Variables (serveur)
| Variable | Défaut | Rôle |
|---|---|---|
| `PUBLIC_URL` | — | Adresse publique de l'éditeur. **Active** comptes et co-édition ; sert aux liens des mails et à l'origine autorisée. |
| `SMTP_URL` / `MAIL_FROM` | — | Envoi de mail (`smtps://utilisateur:mdp@hôte:465`). Sans `SMTP_URL` hors production, les mails sont écrits dans la console. |
| `DATA_DIR` | `./data` | Base SQLite (`app.db`) et partages par lien. **À sauvegarder.** |
| `DB_PATH` | `$DATA_DIR/app.db` | Emplacement de la base. |
| `ALLOW_REGISTRATION` | `1` | `0` : inscription réservée aux personnes invitées. |
| `STATIC_DIR` | — | Dossier de l'éditeur construit (l'image le règle). |
| `TRUST_PROXY` | `1` dans l'image | Lire l'adresse du client dans `X-Forwarded-For` (limitation de débit). Seulement derrière votre proxy. |
| `INSECURE_COOKIES` | — | `1` : cookies sans `Secure` (développement en HTTP uniquement). |
| `MAX_BYTES`, `TTL_DAYS`, `RATE_PER_HOUR`, `ALLOWED_ORIGIN` | voir ADR 0004 | Partage par lien. |

## Sauvegarde
SQLite en mode WAL : sauvegarder à chaud avec la commande de sauvegarde de SQLite, pas en copiant le fichier seul.
```bash
docker compose exec app node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('/data/app.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker compose cp app:/data/backup.db ./sauvegarde-$(date +%F).db
```
Les projets sont aussi exportables par chaque propriétaire (Mon compte → Exporter mes données).

## Mises à jour
`git pull && docker compose up -d --build`. Les migrations de la base s'appliquent au démarrage (`PRAGMA user_version`).

## Développement local avec comptes
```bash
PUBLIC_URL=http://localhost:5173 pnpm --filter @grafcet/server start   # API sur 8787 ; les mails s'affichent dans la console
VITE_ACCOUNTS=1 pnpm dev                                                # éditeur sur 5173, proxy /api et /ws vers 8787
```

## Avant l'ouverture au public
- Compléter les textes légaux de l'éditeur (hébergeur, durée de conservation, contact) et y décrire les comptes : email, nom, projets,
  cookie de session ; droits d'accès, d'export et de suppression (déjà dans l'application). Données d'élèves, parfois mineurs : à valider
  avec le délégué à la protection des données de l'établissement.
- Ne pas diffuser l'adresse avant d'avoir testé l'envoi de courrier de bout en bout.
