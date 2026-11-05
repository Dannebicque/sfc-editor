# GRAFCET Studio

Éditeur et validateur de GRAFCET (IEC 60848) pour le web, **local-first**, pensé pour remplacer SFCEdit :
construction guidée (le curseur ne propose que ce qui est valide), validation continue, simulation à jetons,
interface fr/en, accessibilité clavier et lecteur d'écran.

> État : prototype découpé en paquets (jalon 1a). Voir [docs/decoupage.md](docs/decoupage.md) et la feuille de route ci-dessous.

## Démarrer

```bash
pnpm install
pnpm dev          # éditeur web sur http://localhost:5173
pnpm test         # tests Vitest de tous les paquets
pnpm typecheck    # tsc / vue-tsc
pnpm build        # build de production (apps/web/dist)
```

Prérequis : Node ≥ 20, pnpm 10.

## Organisation

| Paquet | Rôle | Dépendances |
|---|---|---|
| `packages/grafcet-core` | Modèle, grammaire d'insertion guidée, commandes, parseur de réceptivités, validation, graphe plat. **Aucun texte traduit** : le noyau renvoie des clés de message. | aucune |
| `packages/grafcet-layout` | Mise en page récursive calculée depuis l'arbre (pas de coordonnées stockées). | core |
| `packages/grafcet-simulation` | Simulation à jetons (marquage, transitions validables, franchissement). | core |
| `packages/grafcet-io` | Format natif versionné (`schemaVersion`), import JSON libre, contrat `import → { model, report }`. | core, zod |
| `packages/editor` | Application Vue : stores Pinia (document, interface, vue), composants, vue-i18n fr/en. | tous |
| `apps/web` | Shell Vite. | editor |
| `fixtures/` | Exemples de référence (SFCEdit, PLCopen, natif) — à compléter. | — |
| `prototype/` | Prototypes HTML d'origine (référence, non maintenus). | — |

Les paquets internes sont consommés **directement en TypeScript** (pas d'étape de build intermédiaire).

## Feuille de route

- **1a (fait)** noyau + mise en page + format natif JSON + éditeur web, tests de propriétés.
- **1b (fait)** insertion avant/après (Maj + lettre pour le côté opposé), encadrer un élément dans une divergence OU/ET, dissoudre une divergence en gardant une branche, déplacer une branche.
- **1c** PWA hors ligne, shell Electron minimal, dossier `.grafcet` et archive ZIP déterministe.
- **2** macro-étapes, GRAFCETs partiels, forçages, validation IEC 60848 complète.
- **3** import SFCEdit (XML) et export PLCopen — en attente d'échantillons réels dans `fixtures/`.
- **4+** serveur (comptes, partage), puis co-édition temps réel si le besoin est avéré.

Décisions d'architecture : [docs/adr](docs/adr).
