# Politique de sécurité

## Versions concernées

SFC Editor est en développement actif (avant la version 1.0) : seule la branche `main` reçoit des correctifs de sécurité.

## Signaler une vulnérabilité

**Ne publiez pas de vulnérabilité dans une issue publique.**

1. Utilisez de préférence le signalement privé de GitHub : onglet **Security** du dépôt → **Report a vulnerability**.
2. À défaut, écrivez à l'adresse indiquée dans les [mentions légales](https://github.com/Dannebicque/sfc-editor#mentions-légales-et-confidentialité) du projet, en précisant « sécurité » dans l'objet.

Indiquez si possible : la version ou le commit concerné, les étapes pour reproduire, l'impact estimé et, le cas échéant, un fichier d'exemple.

Le projet est maintenu à titre personnel, sur du temps partiel : les accusés de réception et les correctifs sont traités au mieux, sans délai garanti. Nous vous tiendrons informé·e de l'avancement et, avec votre accord, vous créditerons dans la note de correctif.

## Périmètre

L'application s'exécute entièrement dans le navigateur ; elle ne transmet aucune donnée de projet à un serveur. Les sujets qui nous intéressent le plus :

- exécution de script via un fichier importé (JSON, et à terme `.grafcet`, SFCEdit XML, PLCopen XML) ou via le contenu d'un projet (injection, XSS) ;
- analyse de fichiers malveillants (déni de service, archives piégeantes, chemins relatifs) ;
- fuite ou altération de données du stockage local ;
- vulnérabilités dans une dépendance, avec un impact réel sur l'application.

Hors périmètre : les attaques nécessitant déjà un contrôle total du navigateur de la personne, et les rapports automatisés sans démonstration d'impact.

## Sécurité fonctionnelle

SFC Editor est un outil de conception, d'étude et d'enseignement. **Il n'est pas certifié pour la sécurité fonctionnelle** : tout GRAFCET ou code qui en est tiré doit être validé indépendamment avant d'être utilisé sur une installation réelle.
