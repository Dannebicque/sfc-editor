# ADR 0005 — Comptes, projets en ligne et co-édition temps réel

**Statut :** phases 1 à 4 implémentées (serveur, éditeur, tests) ; phase 5 : Dockerfile, Caddy et docs écrits, textes légaux rédigés (reste à renseigner `mailHost` dans `legal/config.ts` et à faire relire) ; SSO reste à faire. Complète l'[ADR 0004](0004-partage-par-lien.md) (partage par lien, inchangé).

## Contexte
L'éditeur est local-first. On veut en faire une vraie application web : comptes, projets enregistrés côté serveur, partage avec des
collègues ou des élèves selon un rôle, et édition à plusieurs en direct. Le mode local sans compte **reste** le mode par défaut : un
utilisateur non connecté garde exactement le comportement actuel (rien n'est envoyé).

Décisions de David Annebicque : connexion **email + mot de passe** d'abord (SSO établissement ensuite) ; co-édition **Yjs + WebSocket** ;
base **SQLite** ; rôles **propriétaire / éditeur / lecteur**. Hébergement auto-hébergé inchangé.

## Décisions

### Données et stockage
- SQLite via `node:sqlite` (intégré à Node, aucune dépendance native, mode WAL). Tout passe par un module `db.ts` avec migrations
  numérotées ; un SGBD client-serveur pourra le remplacer si on dépasse une instance.
- Tables : `users`, `sessions`, `tokens` (vérification d'email, réinitialisation), `projects`, `members`, `invites`.
- Un projet est stocké comme **état Yjs** (blob binaire) plus un **instantané** au format natif (JSON canonique, relu par `importNative`) :
  l'instantané sert à l'export, à la liste, à la sauvegarde lisible et à la validation. Un état Yjs qui ne donnerait pas un projet valide
  n'écrase jamais le dernier instantané valide.

### Comptes et sessions
- Mot de passe : **scrypt** (`node:crypto`, paramètres N=2^15, r=8, p=1, sel 128 bits) ; 10 caractères minimum, 200 maximum. Comparaison à
  temps constant, y compris quand le compte n'existe pas (hachage factice).
- Session : jeton aléatoire de 256 bits dans un cookie `HttpOnly; SameSite=Lax; Secure` (préfixe `__Host-` en production) ; le serveur ne
  garde que l'empreinte SHA-256. Durée glissante de 30 jours, 90 au plus ; déconnexion = suppression côté serveur ; changement de mot de
  passe = toutes les autres sessions révoquées.
- CSRF : `SameSite=Lax` + en-tête `Origin` vérifié sur toute requête qui modifie (doit être l'origine autorisée ou celle du serveur) +
  `Content-Type: application/json` obligatoire. Le WebSocket vérifie aussi `Origin`.
- Pas d'énumération de comptes : l'inscription répond toujours pareil (et envoie un mail « un compte existe déjà » le cas échéant) ;
  la demande de réinitialisation aussi. Limitation de débit par adresse IP **et** par email (en mémoire, rien d'écrit).
- Email vérifié par lien à usage unique (24 h). Un compte non vérifié peut travailler mais ne peut pas accepter d'invitation.
  Réinitialisation : lien à usage unique (1 h).
- Envoi de mail derrière une interface `Mailer` (SMTP en production, console en développement).
- **Droits RGPD** : `GET /api/me/export` (toutes les données du compte) et `DELETE /api/me` (suppression du compte, de ses sessions et des
  projets dont il est seul propriétaire ; les projets partagés sont transférés ou le compte est refusé tant que ce n'est pas réglé).
- Aucun journal ne contient d'adresse IP ni de contenu de projet.
- **Comptes inactifs** : après 24 mois sans connexion, un mail prévient 30 jours avant la suppression (compte + projets dont il est seul propriétaire ; les autres sont transférés). Pas de suppression si l'avertissement n'a pas pu partir. Tâche quotidienne `sweepInactive`.
- **Mineurs** : service ouvert dès 15 ans (accord d'un parent en dessous), annoncé dans les conditions et la politique de confidentialité.

### Droits d'accès
| Rôle | Lire | Modifier le contenu | Renommer, inviter, changer les rôles | Supprimer le projet |
|---|---|---|---|---|
| lecteur | ✔ | — | — | — |
| éditeur | ✔ | ✔ | — | — |
| propriétaire | ✔ | ✔ | ✔ | ✔ |
- Un seul propriétaire par projet (transfert possible vers un membre).
- **Invitation par email** : une ligne `invites(projet, email, rôle)`. Elle devient un droit quand la personne, connectée avec cet email
  **vérifié**, l'accepte. Pas de droit donné à une adresse non vérifiée.
- Le contrôle de rôle est fait **côté serveur** à chaque requête et à chaque message WebSocket : un lecteur dont le client est modifié
  voit ses mises à jour de document ignorées.

### Co-édition
- Transport : WebSocket `/ws/projects/:id` (bibliothèque `ws`), protocole de synchronisation Yjs standard (`y-protocols` : sync + awareness).
  Authentification par le cookie de session, `Origin` vérifié, rôle contrôlé.
- **Granularité : un GRAFCET entier est l'unité de fusion.** Le modèle (ADR 0003) impose des invariants structurels forts
  (alternance étape/transition, liens, renvois) ; deux éditions concurrentes fusionnées au niveau des éléments pourraient produire un
  graphe invalide, et `trial` ne peut pas arbitrer entre deux clients. On stocke donc chaque GRAFCET comme une valeur atomique d'une
  `Y.Map` (identifiant → JSON canonique) : en cas d'édition simultanée **du même GRAFCET**, le dernier écrit gagne et le graphe reste
  toujours valide ; des GRAFCETs différents se fusionnent sans perte (sans conflit). Pour éviter de perdre du travail, la présence
  (awareness) annonce « Alice édite G2 », l'interface le signale et propose de suivre l'autre personne ou d'attendre.
  Une fusion plus fine (champs textuels : réceptivité, nom, actions) pourra être ajoutée plus tard sans changer le protocole.
- Le nom du projet, l'ordre des GRAFCETs et les compteurs d'identifiants sont dans des `Y.Map` à part. Les nouveaux identifiants de
  GRAFCET reçoivent un suffixe aléatoire en mode collaboratif (pas de collision entre deux clients hors ligne).
- Hors ligne : le client continue d'éditer dans le document Yjs en mémoire et se resynchronise à la reconnexion (propriété de Yjs) ; **limite actuelle :
  si l'onglet est fermé hors ligne, les modifications non envoyées sont perdues** (persistance IndexedDB à ajouter, `y-indexeddb`).
- Annuler/rétablir en collaboration : annule **mes** modifications seulement (on ne restaure que le GRAFCET concerné, sans écraser le travail des autres).
- Persistance : le serveur applique, valide et enregistre l'état toutes les quelques secondes après modification et à la fermeture
  du dernier client ; taille maximale par projet (2 Mo) et limite de messages par seconde et par connexion.

### Client
- Un compte n'est **jamais** requis. Les écrans « Se connecter », « Créer un compte », « Mes projets » apparaissent si l'éditeur est
  construit avec `VITE_API_URL` (comme `VITE_SHARE_URL` aujourd'hui) — sans, l'éditeur reste identique à la version locale.
- Un projet local peut être **enregistré dans mon compte** ; un projet en ligne s'ouvre en mode connecté (indicateur d'état :
  synchronisé / hors ligne / lecture seule, pastilles de présence, rôle affiché).
- Accessibilité : formulaires étiquetés, erreurs liées aux champs (`aria-describedby`), annonces `aria-live` pour la présence et l'état
  de synchronisation, tout au clavier, pas d'information portée par la couleur seule.

## Phases
1. **Serveur : comptes, sessions, projets, rôles, invitations** (REST, SQLite, mails, tests). ✔
2. **Serveur : co-édition** (WebSocket Yjs, persistance, validation, rôles) et paquet partagé `@grafcet/collab`.
3. **Client : compte et projets** (connexion, inscription, mon compte, liste, invitations, enregistrer dans mon compte).
4. **Client : co-édition** (liaison Pinia ↔ Yjs, présence, annuler local, hors ligne, états).
5. **Exploitation** : Dockerfile + compose, reverse proxy TLS, sauvegarde SQLite, CI, politique de confidentialité mise à jour (à compléter par
   David : hébergeur, durée de conservation, contact), SSO établissement (OIDC/CAS) en option.

## Conséquences
- Surface d'attaque nouvelle et plus large (authentification, sessions, WebSocket). Contrepartie : pas de dépendance externe pour
  l'identité tant que le SSO n'est pas demandé, et le mode local reste intact.
- Fusion par GRAFCET : on renonce à la fusion fine pour garantir des graphes valides ; c'est un choix réversible.
- Données d'élèves potentiellement mineurs : la politique de confidentialité doit être complétée et validée avant toute ouverture
  publique ; aucun traceur, pas de journal d'adresses IP.
