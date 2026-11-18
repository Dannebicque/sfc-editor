# Déploiement auto-hébergé (comptes, co-édition, partage)

Une seule image fait tout : elle sert la landing page (`/` en français, `/en/` en anglais), l'éditeur construit (`/app/`), l'API (`/api`) et le WebSocket de co-édition (`/ws`) sur **la même origine**.
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
| `COLLAB_REQUIRES_PLAN` | — | `1` : inviter des membres (co-édition) est réservé aux comptes de l'offre `teacher` (erreur `plan_required`). Sans elle, tout compte peut inviter (auto-hébergement). Attribution à la main : `pnpm --filter @grafcet/server plan <email> teacher`. |
| `MAX_PROJECTS_PER_USER` | `5` | Projets en ligne qu'une personne peut créer (offre gratuite). Les projets déjà au-delà restent accessibles. Garder `FREE_ONLINE_PROJECTS` (`limits-config.ts`, affiché sur la landing) d'accord. |
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

## Landing page et essai sans compte
- `apps/web` produit trois pages : la landing (`/`, `/en/`, générée depuis `apps/web/landing/content.ts`) et l'éditeur (`/app/`). Le serveur ajoute la barre finale à `/app` et `/en`.
- Les liens « Créer un compte » de la landing ouvrent `/app/#/register`.
- **Limites de l'essai** (comptes activés, personne de connecté) : `packages/editor/src/limits-config.ts` (3 GRAFCET par projet, 30 étapes par GRAFCET ; exports SFCEdit, PLCopen, ZIP, dossier et partage réservés aux comptes). La landing lit les mêmes constantes. Limites « douces », côté navigateur : elles n'empêchent que l'ajout, jamais l'accès à l'existant. Une instance sans comptes reste sans limite.
- **Découpage des offres** : Essai (sans compte) → Compte gratuit (pas de limite d'essai, 5 projets en ligne, exports d'interopérabilité) → Classe et établissement (à venir : **co-édition**, forfait annuel par classe ou établissement ; la landing n'annonce ni prix ni contenu arrêté).
- **Liste d'attente** : le formulaire de la landing envoie `POST /api/waitlist` (email, type de besoin, consentement obligatoire ; réponse identique pour un doublon ; 10 demandes/heure/IP). Table `waitlist`, purgée après 24 mois. Lire les inscrits : `sqlite3 data/app.db "SELECT * FROM waitlist"`. Suppression sur demande : `DELETE FROM waitlist WHERE email = '…'`.
- **Compteurs d'usage anonymes** : table `usage_daily` (jour, événement, n), sans identifiant, IP ni email. Événements serveur : `register`, `verify`, `project_created`, `invite_sent`, `collab_session`, `waitlist` ; événements navigateur (`POST /api/usage`, liste fermée) : `guest_session`, `limit_grafcets`, `limit_steps`, `limit_cta`, `export_locked`, `landing_try`, `landing_account`. Lecture : `DATA_DIR=./data pnpm --filter @grafcet/server stats [jours]`.
- Ces deux traitements sont décrits dans la politique de confidentialité (section « Liste d'attente et statistiques »).
