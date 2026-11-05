/**
 * Identité de l'éditeur et de l'hébergeur, utilisée dans les textes juridiques.
 * Les champs vides s'affichent comme « [à compléter] » dans l'application : renseignez-les avant toute mise en ligne publique.
 */
export interface LegalConfig {
  product: string;
  /** Nom de l'éditeur (personne physique ou morale) et directeur·rice de la publication. */
  publisher: string;
  /** Adresse e-mail de contact (obligatoire pour les mentions légales et l'exercice des droits RGPD). */
  contact: string;
  /** Adresse postale de l'éditeur. Une personne non professionnelle peut ne la communiquer qu'à l'hébergeur (art. 6, III, 2 de la LCEN). */
  publisherAddress: string;
  hostName: string;
  hostAddress: string;
  hostUrl: string;
  repo: string;
  /** Date de dernière mise à jour des textes (ISO). */
  updated: string;
}

export const LEGAL: LegalConfig = {
  product: 'SFC Editor',
  publisher: 'David Annebicque',
  contact: '',
  publisherAddress: '',
  hostName: '',
  hostAddress: '',
  hostUrl: '',
  repo: 'https://github.com/Dannebicque/sfc-editor',
  updated: '2026-11-05',
};
