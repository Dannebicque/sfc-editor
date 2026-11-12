# SFC Editor — contexte pour Claude Code

Éditeur GRAFCET/SFC (IEC 60848) local-first, FR/EN, qui remplace SFCEdit. Auteur : David Annebicque (enseignant, dev Symfony/Vue ; **UX et accessibilité sont prioritaires**). Répondre en français.

## Commandes
- `pnpm install` · `pnpm -r test` · `pnpm -r typecheck` · `pnpm --filter ./apps/web build` · `pnpm dev`
- Monorepo pnpm 10 + Turborepo, TypeScript, Vue 3 + Vite, Pinia, vue-i18n, Zod 4, Vitest (+ fast-check).
- Les identifiants techniques historiques sont conservés : format `grafcet-studio-project`, clés localStorage `grafcet-studio-v1*`, paquets `@grafcet/*`.

## Modèle (ADR 0003, schéma natif 2.0.0)
- `Seq` = liste alternant étapes/transitions ; `HLink` (div|conv, or|and, base, nodes) ; `Jump` (from, to). Séquence vide = placeholder « X ».
- Règles structurelles dans `packages/grafcet-core/src/graph.ts` (`violations`, `checkGraph`). Toute édition passe par `trial` (`edit.ts`) : appliquée, validée, sinon annulée. Un graphe importé déjà imparfait reste éditable tant que l'édition n'ajoute pas de nouvelle violation.
- Positions jamais stockées : `packages/grafcet-layout/src/layout.ts` les recalcule (y par récursion sur les liens, x par arbre puis balayage anti-chevauchement). Un renvoi vers le début d'une séquence libre atteinte par ce seul renvoi est tracé en trait continu et aligné.
- La barre d'outils (`packages/editor/src/components/Toolbar.vue`) s'appuie sur `capabilities()` : seules les actions possibles sont affichées.
- Anciens fichiers 1.x (arbre) : migrés à la lecture (`migrateProject`).
- Le noyau ne contient aucun texte traduit : il renvoie des clés de message (locales dans `packages/editor/src/locales`, parité fr/en testée).

## Git
- Branche de travail : `feat/graph-model` (réécriture du noyau ; David fusionne dans `main`).
- Fin des messages de commit : `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Reste à faire (backlog)
- Dessin d'un graphe importé invalide (ex. convergence OU dont une branche finit par une étape : étape 14 qui chevauche la barre) — besoin du XML SFCEdit de David pour reproduire.
- Saisir/importer le grand schéma réel (1_2, 30, 5_6, convergences ET, étape 30 partagée) et corriger ce qui manque.
- Tester les exports dans de vrais outils (Beremiz, CODESYS).
- Audit accessibilité de la barre d'outils et du mode « connecter » (clavier, lecteur d'écran, contrastes).
- Simulation : forçages, GRAFCETs partiels, étapes englobantes.
- Mentions légales : placeholders « [à compléter] » à remplir par David (ne rien inventer).
- Vérifier les règles normatives contre la norme ; docs finales (README).
