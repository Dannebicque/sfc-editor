# SFC Editor

Éditeur et validateur de GRAFCET (IEC 60848) pour le web, **local-first**, pensé pour remplacer SFCEdit :
construction guidée (le curseur ne propose que ce qui est valide), validation continue, simulation à jetons,
interface fr/en, accessibilité clavier et lecteur d'écran.

> État : prototype découpé en paquets (jalon 1a). Voir [docs/decoupage.md](docs/decoupage.md) et la feuille de route ci-dessous.

> **Nom.** L'application s'appelle **SFC Editor**. Les identifiants techniques historiques (`grafcet-studio-project` pour le format natif, clés de stockage `grafcet-studio-v1*`, paquets `@grafcet/*`) sont conservés pour ne pas casser les fichiers et les projets déjà enregistrés.

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
- **1c (en grande partie fait)** PWA hors ligne, format dossier (un fichier par GRAFCET, adapté à Git) et archive ZIP déterministe. Reste : shell Electron minimal.
- **2** macro-étapes, GRAFCETs partiels, forçages, validation IEC 60848 complète.
- **3 (fait)** import/export SFCEdit (XML) et PLCopen XML TC6 v2.01 (partie SFC), validés contre le schéma officiel ; voir `fixtures/plcopen/README.md`.
- **4+** serveur (comptes, partage), puis co-édition temps réel si le besoin est avéré.

Décisions d'architecture : [docs/adr](docs/adr).

## Licence et contribution

Code sous licence [Mozilla Public License 2.0](LICENSE) (copyleft au niveau du fichier : les fichiers modifiés restent sous MPL, mais le code peut être combiné avec du code propriétaire).
Composants tiers : [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (régénéré par `node scripts/generate-third-party.mjs`).

- [Contribuer](CONTRIBUTING.md) · [Code de conduite](CODE_OF_CONDUCT.md) ([English](CODE_OF_CONDUCT.en.md)) · [Sécurité](SECURITY.md)

## Mentions légales et confidentialité

L'application affiche ses textes juridiques (mentions légales, confidentialité, cookies et stockage local, conditions d'utilisation, licence) dans le dialogue **Informations légales** du pied de page, adressable par `#/legal/mentions`, `#/legal/privacy`, `#/legal/cookies`, `#/legal/terms` et `#/legal/licence`.

- Textes : `packages/editor/src/legal/{fr,en}.ts` ; identité de l'éditeur et de l'hébergeur : `packages/editor/src/legal/config.ts`.
- Les champs vides de la configuration s'affichent « [à compléter] » dans l'application : **les renseigner avant toute mise en ligne publique** (adresse e-mail de contact, hébergeur, et adresse de l'éditeur si nécessaire). Renseigner aussi l'adresse de contact dans `CODE_OF_CONDUCT.md` et `CODE_OF_CONDUCT.en.md`.
- Ces textes sont des modèles rédigés pour l'état actuel de l'application (local-first, sans compte ni service tiers). Ils sont à relire, et à réviser si des comptes, un serveur ou des mesures d'audience sont ajoutés. Ils ne constituent pas un avis juridique.
- Pour recevoir les signalements de sécurité en privé, activer *Settings → Code security → Private vulnerability reporting* sur GitHub.
