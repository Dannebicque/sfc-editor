# ADR 0004 — Serveur : partage par lien

**Statut :** proposée (serveur et API implémentés ; client et textes légaux à faire).

## Contexte
L'application est **local-first** : aucun compte, aucun serveur, aucune donnée envoyée. Le jalon 4 de la feuille de route ajoute un serveur
« si le besoin est avéré ». Décisions de David Annebicque : périmètre initial = **partage par lien**, pile = **Node + TypeScript**,
hébergement = **auto-hébergé** (VPS ou serveur d'établissement).

Le partage par lien est le plus petit pas qui apporte de la valeur (montrer un GRAFCET à un collègue ou à une classe) sans rien changer au
principe local-first : l'éditeur continue de fonctionner hors ligne et sans serveur, et le partage reste une action explicite.

## Décision
- **Lien-capacité** : un partage est un document immuable identifié par 128 bits aléatoires (base64url, 22 caractères). Savoir le lien suffit
  pour le lire ; il n'y a ni compte, ni liste publique, ni moteur de recherche. L'identifiant est indevinable seulement par force brute (2^128).
- **Suppression** : la création renvoie un **jeton de suppression** (192 bits), affiché une seule fois ; le serveur n'en conserve que l'empreinte
  SHA-256. Sans le jeton, on ne peut pas supprimer avant l'expiration.
- **Expiration** : chaque partage expire (90 jours par défaut, configurable, 1 à 365) ; un balayage supprime les partages échus. Pas de
  renouvellement silencieux.
- **Validation côté serveur** : le contenu reçu est le format natif (`importNative` de `@grafcet/io`, Zod + règles structurelles) ; le serveur
  stocke la **sérialisation canonique** (`exportNative`) et jamais le texte brut reçu (pas de champs inconnus, pas de contenu actif).
- **Limites** : 2 Mo par partage (configurable), 20 créations par heure et par adresse IP, corps limité avant lecture complète, types de contenu
  stricts (`application/json`). Le serveur ne sert que du JSON, jamais de HTML fourni par un utilisateur.
- **Stockage** : un fichier JSON par partage dans un dossier de données (écriture atomique : fichier temporaire puis renommage), derrière une
  interface `ShareStore` (un SGBD pourra la remplacer). Pas de base de données au départ : peu de partages, sauvegarde par copie du dossier.
- **Données personnelles** : le serveur ne reçoit que le projet partagé (que l'utilisateur peut avoir rempli de données personnelles : c'est
  dit dans la confirmation de partage) et l'adresse IP, utilisée **en mémoire seulement** pour la limitation de débit, jamais écrite dans les
  journaux ni sur disque. Aucun cookie, aucun traceur.
- **Pile** : Node ≥ 22.12, TypeScript, sans framework : un gestionnaire `(Request) → Response` (API fetch standard) testable sans réseau,
  et un adaptateur `node:http` de quelques lignes. Dépendances : `@grafcet/io` et `@grafcet/core` seulement.
- **Désactivé par défaut** : l'éditeur n'affiche « Partager » que si une URL de serveur est configurée à la construction
  (`VITE_SHARE_URL`). L'application publique actuelle reste donc sans serveur tant que les textes légaux ne sont pas mis à jour.

## API
| Méthode | Chemin | Corps / en-têtes | Réponse |
|---|---|---|---|
| `POST` | `/api/shares` | document natif (JSON) | `201 { id, deleteToken, expiresAt }` |
| `GET` | `/api/shares/:id` | — | `200` document natif ; `404` si inconnu ou expiré |
| `DELETE` | `/api/shares/:id` | `Authorization: Bearer <jeton>` | `204` ; `403` jeton invalide ; `404` |
| `GET` | `/api/health` | — | `200 { ok: true }` |

Erreurs : JSON `{ error: <code> }` avec `400` (document invalide), `405`, `413` (trop gros), `415` (type de contenu), `429` (débit).
Les réponses portent `Cache-Control: no-store` (sauf `GET` d'un partage : `private, max-age=60`), `X-Content-Type-Options: nosniff`
et l'origine autorisée est celle de `ALLOWED_ORIGIN` (jamais `*`).

## Hors périmètre (étapes suivantes)
1. **Client** : bouton « Partager » (confirmation explicite de ce qui part et de la durée), affichage du lien et du jeton, route `#/s/<id>`
   qui propose d'ouvrir une **copie** locale (pas de mode lecture seule dans un premier temps).
2. **Textes légaux** : politique de confidentialité, conditions et mentions à compléter (hébergeur, durée de conservation, contact) avant
   toute mise en service publique. Ne rien inventer : les champs restent « [à compléter] » jusqu'à la saisie par l'éditeur.
3. **Déploiement** : Dockerfile, reverse proxy TLS (en-têtes `X-Forwarded-For` pris en compte seulement si `TRUST_PROXY=1`), sauvegarde.
4. **Plus tard, si le besoin est avéré** : comptes et sauvegarde cloud, espace classe, co-édition temps réel. Chacun fera l'objet d'une ADR
   (données personnelles d'élèves, parfois mineurs, et RGPD en particulier).

## Conséquences
- Une surface d'attaque nouvelle, volontairement étroite : un point d'entrée qui écrit (POST), validé par le même schéma que l'éditeur.
- Le serveur ne doit jamais interpréter le contenu : réceptivités et actions restent du texte inerte.
- Les partages sont immuables : « mettre à jour » = créer un nouveau lien.
