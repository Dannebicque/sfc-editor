# ADR 0002 — Format natif `.grafcet`

**Statut :** partiellement mis en œuvre.

## Décision
- Document JSON versionné : `{ format: "grafcet-studio-project", schemaVersion: "1.0.0", project }`, validé par Zod (`@grafcet/io`).
- Sérialisation **déterministe** (ordre des clés fixé par le schéma, indentation 2, saut de ligne final) pour des diffs Git exploitables.
- Refus lisible d'un format inconnu, d'une version majeure incompatible, d'une structure contraire à la grammaire ou d'ids dupliqués.
- Les adaptateurs suivent le contrat `import(source) → { model, report }` / `export(model) → { output, report }` (`ConversionReport`).

## À faire (jalon 1c)
- **Dossier de projet** (`manifest.json`, `variables.json`, `grafcets/<id>.json`) pour Git, et **archive ZIP** déterministe (ordre fixe, horodatages fixes) avec hash de contenu dans le manifeste.
- Champs `generator`, `createdAt`/`modifiedAt`, conservation des extensions inconnues.
- Validation de l'archive avant extraction (chemins, tailles, nombre de fichiers) ; écriture atomique côté desktop.

## Révision 1.1.0 — identifiants d'étapes textuels

`Step.num` passe d'un entier à un texte libre sans espace (lettres, chiffres, `_`) : `"12"`, `"X12"`, `"INIT"`. Les fichiers 1.0.x
(entier) restent lisibles : la valeur est lue comme texte. Dans une réceptivité, un mot désigne une étape s'il est un identifiant
connu du projet, ou s'il vaut `X` + un identifiant connu (`X12` → étape `12`) ; les transitions gardent un numéro entier.
