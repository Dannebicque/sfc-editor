# ADR 0006 — Espaces de classe (offre « Classe et établissement »)

**Statut :** premier lot implémenté (serveur, éditeur, tests). Hors lot : SSO, paiement, notes, rendu avec échéance bloquante, import CSV de fichier. Complète l'[ADR 0005](0005-comptes-et-co-edition.md).

## Contexte
L'offre payante « Classe et établissement » doit permettre à un·e enseignant·e de faire travailler une classe sur des GRAFCET : créer des comptes
élèves, proposer un sujet, suivre les rendus, ouvrir la copie d'un·e élève et la commenter. On veut le modèle le plus simple possible et **réutiliser**
les projets, rôles (`members`), invitations par email et la co-édition existants, plutôt que de créer un second système de partage.

## Décisions

### Modèle
- `classes(id, teacher_id, name, created_at)` : une classe appartient à un compte `users`. Créer une classe exige l'offre `teacher` quand
  `COLLAB_REQUIRES_PLAN=1` (même interrupteur que la co-édition ; sans lui, instance auto-hébergée, tout compte vérifié peut en créer).
- `class_students(class_id, user_id, joined_at)` : élèves **inscrits**. Un·e élève est un compte ordinaire (`users`), qui peut aussi avoir ses
  propres projets et appartenir à plusieurs classes.
- `class_invites(id, class_id, email, invited_by, created_at, expires_at)` : invitation d'un compte **déjà existant** (adresse connue). Elle suit
  exactement la règle des invitations de projet : acceptée explicitement par la personne, connectée avec cette adresse **vérifiée**. On n'inscrit
  jamais de force un compte existant.
- `assignments(id, class_id, title, instructions, template, created_at, due_at)` : un **sujet**. `template` est un instantané (JSON natif,
  validé par `importNative`) pris à la publication : modifier ensuite le projet source ne change rien aux copies déjà distribuées.
- `submissions(assignment_id, student_id, project_id, status, submitted_at)` : une ligne par élève et par sujet. `project_id` désigne la **copie de
  l'élève**, un `projects` ordinaire dont l'élève est `owner`.
- `submission_comments(id, assignment_id, student_id, author_id, body, created_at)` : commentaires de l'enseignant·e, lisibles par l'élève.

### Comptes élèves en lot
- L'enseignant·e envoie une liste `{nom, email}` (jusqu'à 100 lignes par appel, 200 élèves par classe). Pour chaque adresse :
  - **inconnue** : un compte est créé (mot de passe aléatoire inutilisable) et inscrit tout de suite ; l'élève reçoit un mail de bienvenue avec un lien
    d'activation (le mécanisme de réinitialisation existant, validité 14 jours, qui confirme aussi l'adresse) pour **choisir son mot de passe** ;
  - **déjà un compte** : une `class_invite` et un mail ; rien ne change tant que la personne n'a pas accepté ;
  - **déjà dans la classe** : ignorée. La réponse est un compte rendu ligne à ligne.
- Le serveur ne connaît ni ne transmet jamais de mot de passe d'élève ; l'enseignant·e ne peut ni se connecter à leur place ni changer leur mot de
  passe. Il peut seulement renvoyer le lien d'activation tant que le compte n'est pas activé.
- **Mineurs** : c'est l'établissement ou l'enseignant·e qui recueille l'éventuel accord parental pour les comptes qu'il crée ; les conditions et la
  politique de confidentialité le disent. Les données d'un·e élève sont : nom, adresse email, ses copies et les commentaires reçus.

### Sujets, copies, rendus
- Publier un sujet crée aussitôt une copie pour chaque élève inscrit·e, et une copie est créée à l'inscription d'un·e nouvel·le élève pour les sujets
  existants. Le sujet vient d'un de ses projets en ligne (`projectId`) ou d'un document envoyé.
- Chaque élève travaille sur sa copie avec l'éditeur et la co-édition habituels (rôle `owner` sur son projet).
- Statut : `todo` ou `submitted` (« Rendre » / « Reprendre »). Rendre ne verrouille rien : l'échéance est indicative.
- **Accès de l'enseignant·e** : à la demande, il·elle devient membre de la copie (`members`) avec le rôle `viewer` (lecture seule) ou `editor`, via
  `PUT …/submissions/:élève/access`, et peut s'en retirer. Pas de membre créé d'avance pour toute la classe (sa liste de projets reste lisible).
- Protections : l'élève ne peut ni retirer ni rétrograder l'enseignant·e de sa copie (`class_managed`), ni supprimer la copie. La co-édition
  (WebSocket) est autorisée sur une copie de classe quel que soit l'offre du propriétaire, puisque c'est l'enseignant·e qui en a l'offre.

### Fin de vie
- Retirer un·e élève ou supprimer la classe/le sujet : l'accès de l'enseignant·e aux copies est retiré, **les copies restent à l'élève**.
- Suppression du compte d'un·e élève (droit RGPD) : ses copies de classe et ses commentaires sont **supprimés** (pas transférés à l'enseignant·e).
- Suppression du compte de l'enseignant·e : classes, sujets et commentaires supprimés ; les copies restent aux élèves.

## Conséquences
- Aucune nouvelle brique d'authentification : activation et invitations reprennent les jetons et règles d'email vérifié existants.
- Le SSO (OIDC/CAS) pourra remplacer la création de comptes par import sans changer les tables.
- Un commentaire n'est pas modifiable par l'élève ; un fil d'échanges pourra être ajouté plus tard.
