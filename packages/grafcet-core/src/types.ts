/**
 * Modèle métier d'un GRAFCET (IEC 60848), proche de celui de SFCEdit : des séquences (chaînes alternant étapes et
 * transitions) reliées par des liens horizontaux (divergences et convergences, OU ou ET, ouvertes ou non) et des renvois.
 * Les identifiants sont des chaînes opaques stables. Voir docs/adr/0003-modele-sequences-liens.md.
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
}

/** Élément d'une séquence : étape ou transition (elles alternent). */
export type Node = Step | Transition;
export type Item = Node;
export type ItemKind = Item['kind'];

/**
 * Séquence : chaîne linéaire d'étapes et de transitions qui alternent. Une séquence vide est un emplacement « X »
 * à compléter. Les séquences sont reliées entre elles par des liens horizontaux (divergences/convergences) et des renvois.
 */
export interface Seq {
  id: string;
  items: Node[];
}

/**
 * Lien horizontal (barre) entre séquences.
 *  - divergence (`div`) : la fin de la séquence `base` se prolonge dans le début de chaque séquence de `nodes` ;
 *  - convergence (`conv`) : la fin de chaque séquence de `nodes` se prolonge dans le début de la séquence `base`.
 * `op` : OU (barre simple, branches alternatives) ou ET (double barre, branches parallèles).
 * `base` vaut null pour un lien ouvert (divergence sans amont, convergence sans aval).
 */
export interface HLink {
  id: string;
  kind: 'div' | 'conv';
  op: 'or' | 'and';
  base: string | null;
  nodes: string[];
}

/** Renvoi : la fin de la séquence `from` se prolonge vers l'étape ou la transition `to` (null : cible manquante). */
export interface Jump {
  id: string;
  from: string;
  to: string | null;
}

export interface Grafcet {
  id: string;
  name: string;
  /** Commentaire libre (facultatif). */
  comment?: string;
  nextStep: number;
  nextTrans: number;
  seqs: Seq[];
  links: HLink[];
  jumps: Jump[];
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
