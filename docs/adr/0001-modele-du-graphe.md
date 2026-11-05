# ADR 0001 — Modèle du graphe : arbre structuré aujourd'hui, graphe canonique cible

**Statut :** proposé — à trancher avant le jalon 2.

## Contexte
Le prototype représente un GRAFCET comme un **arbre** : séquence d'éléments (étape, transition, renvoi) et de blocs (divergence OU/ET) contenant des branches. Cela rend la grammaire d'insertion guidée simple et la mise en page calculable récursivement, mais ne représente pas les graphes non réductibles à un arbre, ni les structures que SFCEdit et PLCopen peuvent produire.

## Décision provisoire
Conserver l'arbre comme **structure d'édition** (jalon 1) et le graphe plat (`flatten`) comme **vue dérivée**. Les identifiants sont des chaînes opaques stables ; le suffixe `:d` n'existe que dans la sélection de l'interface, jamais dans le modèle.

## À décider
- Le fichier stocke-t-il le **graphe sémantique** (nœuds + liaisons), l'arbre étant calculé quand le graphe est structuré ? (recommandé)
- Que faire de l'édition guidée sur un graphe non structuré : mode libre, ou refus explicite ?
- Identifiants UUID plutôt que le compteur `n<k>` du projet (utile pour la fusion et la co-édition).

## Conséquences
Les imports SFCEdit/PLCopen arriveront sous forme de graphe : le choix doit être fait avant de les écrire.
