# Contribuer à SFC Editor

Merci de votre intérêt ! Les contributions (code, tests, traductions, exemples de fichiers, retours d'usage) sont bienvenues, en français ou en anglais.

En participant, vous acceptez le [code de conduite](CODE_OF_CONDUCT.md) (version [anglaise](CODE_OF_CONDUCT.en.md)).

## Licence des contributions

Le projet est sous licence **Mozilla Public License 2.0** (voir [LICENSE](LICENSE)). En proposant une contribution, vous certifiez en être l'auteur·rice ou avoir le droit de la proposer, et vous acceptez qu'elle soit distribuée sous cette même licence. Aucune cession de droits n'est demandée.

Les modifications d'un fichier existant restent sous MPL-2.0 ; les nouveaux fichiers peuvent porter l'en-tête facultatif de la licence.

## Démarrer

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck && pnpm test && pnpm build
```

Prérequis : Node ≥ 20 et pnpm 10. Le dépôt est un monorepo : voir [README](README.md) et [docs/decoupage.md](docs/decoupage.md).

## Principes à respecter

- **Le noyau (`packages/grafcet-core`) ne dépend de rien** : ni Vue, ni DOM, ni traduction. Il renvoie des clés de message ; l'interface les met en texte.
- **Toute modification du document passe par une commande du noyau**, testée (idéalement par un test de propriétés : le GRAFCET reste valide quelles que soient les opérations).
- **Accessibilité** : toute fonction doit être utilisable au clavier, avoir un nom accessible et ne pas reposer sur la couleur seule. Les messages d'état passent par la région `aria-live`.
- **Internationalisation** : toute chaîne visible va dans `packages/editor/src/locales/{fr,en}.json`, avec les mêmes clés et paramètres dans les deux langues (un test le vérifie).
- **Pas de réseau, pas de traceur** : l'application doit rester utilisable hors ligne et ne contacter aucun service tiers (polices incluses).
- Pas de dépendance nouvelle sans raison claire : indiquez sa licence dans la PR.

## Proposer une modification

1. Ouvrez d'abord une issue pour les changements importants (format de fichier, modèle, architecture : voir [docs/adr](docs/adr)).
2. Créez une branche (`feat/…`, `fix/…`, `docs/…`) à partir de `main`.
3. Ajoutez ou adaptez les tests ; `pnpm typecheck`, `pnpm test` et `pnpm build` doivent passer.
4. Rédigez des messages de commit clairs (en français ou en anglais), un sujet court puis une description si nécessaire.
5. Ouvrez la pull request en remplissant le modèle.

## Exemples de fichiers

Les fichiers d'exemple (SFCEdit, PLCopen…) sont précieux pour les imports. Avant de les ajouter dans `fixtures/`, vérifiez que vous avez le droit de les partager et retirez toute donnée confidentielle (noms de machines, de sites, d'entreprises).
