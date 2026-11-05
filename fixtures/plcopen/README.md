# Fixtures PLCopen

- `convergence-et-renvoi.plcopen.xml` : export PLCopen (TC6 v2.01) de `../sfcedit/convergence-et-renvoi.xml` par SFC Editor.

Le schéma `tc6_xml_v201.xsd` n'est pas redistribué ici. Pour valider les exports contre lui :

```sh
PLCOPEN_XSD=/chemin/vers/tc6_xml_v201.xsd pnpm --filter @grafcet/io test   # nécessite xmllint
```
