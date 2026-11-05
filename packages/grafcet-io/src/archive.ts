import type { Grafcet, Project } from '@grafcet/core';
import { ImportError, type ExportResult, type ImportResult } from './contract';
import { exportNative, importNative } from './native';
import { FORMAT_ID, SCHEMA_VERSION } from './schema';
import { readZip, writeZip, ZipError } from './zip';

/**
 * Format « dossier » (et son archive ZIP déterministe) : un fichier par GRAFCET, adapté à Git et aux diffs.
 *
 *   project.json            { format, schemaVersion, project: { name, counter, gcount, grafcets: ["grafcets/00-….json", …] } }
 *   grafcets/00-nom.json    un GRAFCET (même schéma que dans le format natif)
 */
export const PROJECT_FILE = 'project.json';
export interface FolderFile { path: string; text: string }

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'grafcet';

/** Fichiers du format dossier, triés par chemin (déterministe). */
export function exportFolder(project: Project): ExportResult<FolderFile[]> {
  const full = JSON.parse(exportNative(project).output) as { project: Project };
  const files: FolderFile[] = [];
  const refs: string[] = [];
  full.project.grafcets.forEach((g: Grafcet, i) => {
    const path = `grafcets/${String(i).padStart(2, '0')}-${slug(g.name)}.json`;
    refs.push(path);
    files.push({ path, text: JSON.stringify(g, null, 2) + '\n' });
  });
  const { name, counter, gcount } = full.project;
  files.push({ path: PROJECT_FILE, text: JSON.stringify({ format: FORMAT_ID, schemaVersion: SCHEMA_VERSION, project: { name, counter, gcount, grafcets: refs } }, null, 2) + '\n' });
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { output: files, report: { entries: [] } };
}

/** Relit un dossier : assemble `project.json` et les fichiers de GRAFCET, puis valide comme le format natif. */
export function importFolder(files: FolderFile[]): ImportResult<Project> {
  const byPath = new Map(files.map((f) => [f.path, f.text]));
  const head = byPath.get(PROJECT_FILE);
  if (head === undefined) throw new ImportError({ key: 'imp_folder_missing', params: { f: PROJECT_FILE } });
  let env: { project?: { grafcets?: unknown } } & Record<string, unknown>;
  try { env = JSON.parse(head); } catch (e) { throw new ImportError({ key: 'imp_raw', params: { m: String((e as Error).message) } }); }
  const refs = env.project?.grafcets;
  if (!Array.isArray(refs) || refs.some((r) => typeof r !== 'string')) throw new ImportError({ key: 'imp_raw', params: { m: 'project.grafcets' } });
  const grafcets = (refs as string[]).map((path) => {
    const t = byPath.get(path);
    if (t === undefined) throw new ImportError({ key: 'imp_folder_missing', params: { f: path } });
    try { return JSON.parse(t); } catch (e) { throw new ImportError({ key: 'imp_raw', params: { m: path + ' : ' + String((e as Error).message) } }); }
  });
  return importNative(JSON.stringify({ ...env, project: { ...env.project, grafcets } }));
}

const enc = new TextEncoder(), dec = new TextDecoder('utf-8');

/** Archive ZIP déterministe du format dossier (extension conseillée : `.grafcet.zip`). */
export function exportArchive(project: Project): ExportResult<Uint8Array> {
  const { output } = exportFolder(project);
  return { output: writeZip(output.map((f) => ({ path: f.path, data: enc.encode(f.text) }))), report: { entries: [] } };
}

export function importArchive(bytes: Uint8Array): ImportResult<Project> {
  try {
    return importFolder(readZip(bytes).map((e) => ({ path: e.path, text: dec.decode(e.data) })));
  } catch (e) {
    if (e instanceof ZipError) throw new ImportError({ key: 'imp_zip_' + e.code });
    throw e;
  }
}

/** Les deux premiers octets d'un ZIP (« PK »). */
export const looksLikeZip = (b: Uint8Array): boolean => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b;
