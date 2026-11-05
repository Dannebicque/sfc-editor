# Du prototype HTML aux paquets

Le prototype (`prototype/editeur-grafcet.html`, ~1900 lignes, un seul fichier) a été découpé selon l'architecture cible.

| Prototype | Destination |
|---|---|
| § 1 Noyau : `checkSeq`, `PATTERNS`, `findPattern`, `allowedInsertions`, `doInsert`, `tryRemove`, `renumber`, `parseRecept`, `flatten`, `validateGrafcet`, `describe*`, `demoProject` | `packages/grafcet-core/src` (`grammar`, `insertion`, `commands`, `recept`, `flatten`, `validate`, `describe`, `demo`) |
| `layoutGrafcet`, `GEO` | `packages/grafcet-layout/src/layout.ts` |
| Simulation (`simEnabled`, `simFire`, `simReset`) | `packages/grafcet-simulation` |
| `applyImport`, export JSON | `packages/grafcet-io` (`legacy.ts`, `native.ts`) |
| `I18N`, `T`, `KEYMAP`, `DEMO` | `packages/editor/src/locales/*.json` (vue-i18n), `demo-texts.json`, `i18n.ts` |
| `setup()` de l'application | Stores Pinia : `project` (document, historique), `ui` (sélection, commandes, simulation, import), `view` (pan/zoom, mise en page) |
| `TEMPLATE` | Composants : `AppHeader`, `ProjectSidebar`, `CanvasStage`, `InsertBar`, `InspectorPanel` (`PropsPanel`, `IssuesPanel`, `TextPanel`, `DataPanel`), `StatusBar` |
| CSS | `packages/editor/src/styles/app.css` (inchangé) ; polices IBM Plex auto-hébergées (`@fontsource`) |

## Ce qui change réellement

- **Le noyau ne traduit plus rien.** Validation, analyse des réceptivités, descriptions et suggestions d'insertion renvoient des clés de message + paramètres (`Issue`, `Message`, `Description`, `Insertion`). L'éditeur les met en texte (`format.ts`). Les tests peuvent donc vérifier un code d'erreur sans dépendre de la langue.
- **Commandes métier dans le noyau** : `insertAfter`, `removeItem`, `addBranch`, `removeBranch`, `renumber`, `newGrafcet`, `duplicateGrafcet` sont des fonctions pures testées, indépendantes de Vue.
- `renumber` réécrit aussi les références `Xn` des **conditions d'actions** (le prototype ne le faisait que pour les réceptivités).
- La duplication d'un GRAFCET attribue de **nouveaux identifiants** aux éléments (et réécrit les renvois) ; le prototype conservait les mêmes ids.
- Nouveau **format natif** (`grafcet-studio-project`, `schemaVersion` 1.0.0) avec sérialisation déterministe, onglet « Projet (.grafcet) » et bouton de téléchargement. L'import accepte toujours le JSON libre du prototype.
- Clé de stockage local : `grafcet-studio-v1` (les projets du prototype ne sont pas migrés automatiquement : les ré-importer par l'onglet Données).

## Inchangé
Grammaire de construction guidée, mise en page, raccourcis (E T O A R / S T O A J), simulation à jetons, annonces ARIA, thème clair/sombre/auto.
