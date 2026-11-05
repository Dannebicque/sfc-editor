# ADR 0003 — Plusieurs séquences par GRAFCET, reliées par des liens

## Contexte
Le modèle initial ne contenait qu'un arbre de séquences par GRAFCET. Les schémas réels (par exemple ceux de SFCEdit)
contiennent plusieurs séquences distinctes reliées entre elles par des convergences ET/OU « libres » : une étape isolée
qui participe à deux synchronisations, par exemple.

## Décision
- `Grafcet.items` reste la séquence principale ; `Grafcet.more` (facultatif, schéma 1.1.0 inchangé) contient des
  séquences indépendantes, chacune valide au sens de la grammaire racine (`checkGrafcet`).
- Les liens entre séquences ne sont pas des éléments de l'arbre :
  - **convergence ET libre** : `Transition.sync` (étapes attendues en plus de l'étape amont) ;
  - **convergence OU libre** : renvois (`jump`) vers l'étape ou la transition cible.
- La mise en page place les séquences côte à côte et trace les synchronisations en double barre avec des lignes
  orthogonales depuis chaque étape attendue.
- SFCEdit : séquences supplémentaires et convergences libres (`hlink conv`) sont importées et exportées ;
  PLCopen : séquences supplémentaires et transitions à plusieurs étapes amont.

## Conséquences
- Tous les parcours passent par `sequencesOf` / `walkGrafcet` / `locateIn` / `findInGrafcet`.
- L'ordre des séquences détermine leur position (commandes de déplacement).
- Une synchronisation dont l'étape attendue n'est pas en fin de séquence ne peut pas être exportée en SFCEdit
  (avertissement dans le rapport).
