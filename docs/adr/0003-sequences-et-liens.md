# ADR 0003 — Modèle séquences + liens horizontaux (schéma 2.0.0)

**Statut :** accepté — remplace la décision provisoire de l'[ADR 0001](0001-modele-du-graphe.md).

## Contexte
L'arbre de blocs (divergence = bloc contenant des branches) ne permet pas de saisir les schémas réels de SFCEdit : divergences et convergences ouvertes ou asymétriques, convergence construite « vers le haut » depuis des placeholders, étapes partagées par plusieurs convergences ET, renvois libres.

## Décision
Un GRAFCET est un ensemble de **séquences** (listes alternant étapes et transitions), reliées par des **liens horizontaux** et des **renvois** :

- `Seq {id, items}` : une séquence vide est un placeholder « X ».
- `HLink {id, kind: div|conv, op: or|and, base, nodes}` : `base` peut être `null` (lien ouvert).
- `Jump {id, from, to}` : renvoi depuis la fin d'une séquence vers un élément de nature opposée.

Règles structurelles (`checkGraph`) : alternance étape/transition ; divergence OU = base finissant par une étape et branches commençant par une transition (ET : l'inverse) ; convergence symétrique ; chaque fin et chaque début de séquence est utilisé au plus une fois ; au moins deux branches ; graphe de liens acyclique.

Toute édition est **transactionnelle** (`trial`) : appliquée, validée par `checkGraph`, sinon annulée. L'interface s'appuie sur `capabilities()` pour activer les commandes.

Les positions ne sont jamais stockées : le moteur de mise en page les recalcule (y par récursion sur les liens, x par placement en arbre puis balayage anti-chevauchement). Les cadenas d'alignement de SFCEdit sont ignorés.

## Compatibilité
Le format natif passe en **2.0.0** ; les fichiers 1.x (arbre) sont migrés à la lecture (`migrateProject`), y compris depuis le stockage local. Import/export SFCEdit quasi 1:1 ; PLCopen par nœuds de divergence/convergence.

## Conséquences
- Édition « Connecter », « Fusionner », renvois et barre d'outils complète possibles.
- Un renvoi vers le milieu d'une séquence n'est pas exportable en SFCEdit (erreur explicite `rep_x_jump_mid`).
- Les identifiants restent des chaînes opaques issues d'un compteur (UUID reste ouvert).
