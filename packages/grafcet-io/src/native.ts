import { checkGrafcet, walkAll, type Project, walkGrafcet } from '@grafcet/core';
import { ImportError, type ExportResult, type ImportResult } from './contract';
import { FORMAT_ID, ProjectSchema, SCHEMA_VERSION } from './schema';

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
  if (typeof env.schemaVersion !== 'string' || major(env.schemaVersion) !== major(SCHEMA_VERSION)) {
    throw new ImportError({ key: 'imp_version', params: { v: String(env.schemaVersion) } });
  }
  const parsed = ProjectSchema.safeParse(env.project);
  if (!parsed.success) throw new ImportError({ key: 'imp_raw', params: { m: parsed.error.issues[0]?.path.join('.') + ' : ' + parsed.error.issues[0]?.message } });
  const project = parsed.data;
  if (!project.grafcets.length) throw new ImportError({ key: 'imp_empty' });
  for (const g of project.grafcets) {
    const e = checkGrafcet(g);
    if (e) throw new ImportError({ key: 'imp_struct', params: { g: g.name || '?', e: { key: e } } });
    const ids = new Set<string>();
    walkGrafcet(g, (it) => {
      if (ids.has(it.id)) throw new ImportError({ key: 'imp_ids', params: { g: g.name || '?' } });
      ids.add(it.id);
    });
  }
  return { model: project, report: { entries: [] } };
}
