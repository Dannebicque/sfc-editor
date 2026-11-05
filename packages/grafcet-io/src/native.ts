import { checkGraph, migrateProject, nodesOf, type Project } from '@grafcet/core';
import { ImportError, type ExportResult, type ImportResult } from './contract';
import { FORMAT_ID, ProjectSchema, SCHEMA_VERSION, TreeProjectSchema } from './schema';

export interface NativeEnvelope { format: typeof FORMAT_ID; schemaVersion: string; project: Project }

/** Sérialisation déterministe du format natif (JSON indenté, ordre des clés fixé par le schéma, saut de ligne final). */
export function exportNative(project: Project): ExportResult<string> {
  const env: NativeEnvelope = { format: FORMAT_ID, schemaVersion: SCHEMA_VERSION, project: ProjectSchema.parse(project) };
  return { output: JSON.stringify(env, null, 2) + '\n', report: { entries: [] } };
}

const major = (v: string) => Number(v.split('.')[0]);

/** Lecture stricte d'un document natif : version, schéma, grammaire des séquences, unicité des ids. */
export function importNative(text: string): ImportResult<Project> {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { throw new ImportError({ key: 'imp_raw', params: { m: String((e as Error).message) } }); }
  const env = raw as Partial<NativeEnvelope> | null;
  if (!env || env.format !== FORMAT_ID) throw new ImportError({ key: 'imp_format' });
  if (typeof env.schemaVersion !== 'string' || ![1, major(SCHEMA_VERSION)].includes(major(env.schemaVersion))) {
    throw new ImportError({ key: 'imp_version', params: { v: String(env.schemaVersion) } });
  }
  const legacy = major(env.schemaVersion) === 1;
  const parsed = legacy ? TreeProjectSchema.safeParse(env.project) : ProjectSchema.safeParse(env.project);
  if (!parsed.success) throw new ImportError({ key: 'imp_raw', params: { m: parsed.error.issues[0]?.path.join('.') + ' : ' + parsed.error.issues[0]?.message } });
  // Les fichiers 1.x (arbre de blocs) sont convertis en séquences + liens à la lecture.
  const project: Project = legacy ? migrateProject(parsed.data as Parameters<typeof migrateProject>[0]) : (parsed.data as Project);
  if (!project.grafcets.length) throw new ImportError({ key: 'imp_empty' });
  for (const g of project.grafcets) {
    const ids = new Set<string>();
    for (const it of nodesOf(g)) {
      if (ids.has(it.id)) throw new ImportError({ key: 'imp_ids', params: { g: g.name || '?' } });
      ids.add(it.id);
    }
    const e = checkGraph(g);
    if (e) throw new ImportError({ key: 'imp_struct', params: { g: g.name || '?', e: { key: e } } });
  }
  return { model: project, report: { entries: [] } };
}
