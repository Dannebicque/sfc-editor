/**
 * Modèle métier d'un GRAFCET (IEC 60848).
 *
 * Un GRAFCET est une séquence d'éléments : étape, transition, divergence OU,
 * divergence ET, renvoi. Les divergences contiennent des branches, qui sont
 * elles-mêmes des séquences. Les identifiants sont des chaînes opaques stables.
 * Voir docs/adr/0001-modele-graphe.md pour l'évolution vers un graphe canonique.
 */
/** Types d'action : continue, conditionnelle (niveau), sur activation, sur désactivation, ou sur événement (`cond` = l'événement, ex. « ↑a »). */
export type ActionKind = 'continue' | 'conditional' | 'activation' | 'deactivation' | 'event';

export interface Action {
  kind: ActionKind;
  label: string;
  /** Condition d'une action conditionnelle (texte source d'une réceptivité). */
  cond: string;
}

export interface Step {
  id: string;
  kind: 'step';
  /** Identifiant (numéro) de l'étape : un texte libre sans espace (« 12 », « X12 », « INIT »…), unique dans le GRAFCET. */
  num: string;
  name: string;
  initial: boolean;
  actions: Action[];
  /**
   * Macro-étape : identifiant du GRAFCET qui en est l'expansion (`null` tant qu'aucune expansion n'est choisie).
   * Absent pour une étape ordinaire.
   */
  expansion?: string | null;
  /** Rôle dans une expansion : étape d'entrée (E) ou de sortie (S). */
  role?: 'entry' | 'exit';
}

export interface Transition {
  id: string;
  kind: 'trans';
  num: number;
  /** Texte source de la réceptivité. */
  recept: string;
  /** Actions exécutées au franchissement de la transition (type « sur événement » ; `cond` : condition facultative). */
  actions?: Action[];
  /** Synchronisation : identifiants d'étapes (du même GRAFCET) que la transition attend en plus de son étape amont (convergence ET libre). */
  sync?: string[];
}

export interface Jump {
  id: string;
  kind: 'jump';
  /** Id de l'étape ou de la transition visée (null si aucune cible n'existe). */
  target: string | null;
}

export type BlockKind = 'or' | 'and';

export interface Block {
  id: string;
  kind: BlockKind;
  branches: Item[][];
}

export type Item = Step | Transition | Jump | Block;
export type ItemKind = Item['kind'];
/** Contexte d'une séquence : racine, branche de divergence OU, ou branche de divergence ET. */
export type SeqContext = 'root' | BlockKind;

export interface Grafcet {
  id: string;
  name: string;
  /** Commentaire libre (facultatif). */
  comment?: string;
  nextStep: number;
  nextTrans: number;
  items: Item[];
}

export interface Project {
  name: string;
  /** Compteur d'identifiants d'éléments. */
  counter: number;
  /** Compteur d'identifiants de GRAFCET. */
  gcount: number;
  grafcets: Grafcet[];
}

/** Message localisable : clé + paramètres. Le noyau ne produit jamais de texte traduit. */
export interface Message {
  key: string;
  params?: Record<string, MessageParam>;
  /** Position (0-based) dans un texte source, pour les erreurs d'analyse. */
  pos?: number;
}
export type MessageParam = string | number | Message;

export const isBlock = (it: Item | null | undefined): it is Block =>
  !!it && (it.kind === 'or' || it.kind === 'and');
