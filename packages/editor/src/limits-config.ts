/**
 * Limites de l'essai sans compte. Elles ne s'appliquent que si l'éditeur est construit avec les comptes (`VITE_ACCOUNTS=1`) et que
 * personne n'est connecté : une instance purement locale reste sans limite. Ce sont des limites « douces » (côté navigateur) :
 * elles empêchent d'ajouter, jamais de perdre ou de masquer ce qui existe déjà.
 * Constantes dans `limits-config.ts` (sans dépendance) : la landing page les lit aussi, pour ne jamais afficher d'autres chiffres.
 */
export interface Limits { grafcets: number; steps: number }
export const GUEST_LIMITS: Limits = { grafcets: 3, steps: 30 };

/** Formats d'export réservés aux comptes (interopérabilité et partage) ; JSON natif, images, PDF restent libres. */
export const GUEST_LOCKED_EXPORTS: readonly string[] = ['sfcedit', 'plcopen', 'zip', 'folder', 'share'];

/** Projets en ligne par compte gratuit. Appliqué par le serveur (`MAX_PROJECTS_PER_USER`, défaut 5) : garder les deux d'accord. */
export const FREE_ONLINE_PROJECTS = 5;
