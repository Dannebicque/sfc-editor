import type { Message } from '@grafcet/core';

/** Rapport de conversion : ce qui a été perdu, approximé ou corrigé lors d'un import/export. */
export interface ReportEntry {
  level: 'info' | 'warning' | 'error';
  message: Message;
}
export interface ConversionReport { entries: ReportEntry[] }

/** Contrat commun des adaptateurs de format : import(source) → { model, report } ; export(model) → { output, report }. */
export interface ImportResult<M> { model: M; report: ConversionReport }
export interface ExportResult<O> { output: O; report: ConversionReport }

/** Erreur d'import irrécupérable ; le message est localisable. */
export class ImportError extends Error {
  constructor(public readonly info: Message) {
    super(info.key);
    this.name = 'ImportError';
  }
}
