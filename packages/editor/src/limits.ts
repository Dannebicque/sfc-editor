import { stats, type Project } from '@grafcet/core';
import { GUEST_LOCKED_EXPORTS, type Limits } from './limits-config';

export { GUEST_LIMITS, GUEST_LOCKED_EXPORTS, type Limits } from './limits-config';

export const isExportLocked = (format: string, limits: Limits | null): boolean => !!limits && GUEST_LOCKED_EXPORTS.includes(format);

export type LimitKind = 'grafcets' | 'steps';

/**
 * Première limite que `after` dépasse sans que `before` ne la dépassait déjà plus largement.
 * Un projet importé ou ouvert avant l'introduction des limites reste donc éditable (on peut retirer, jamais ajouter).
 */
export function exceeded(before: Project, after: Project, limits: Limits | null): LimitKind | null {
  if (!limits) return null;
  if (after.grafcets.length > limits.grafcets && after.grafcets.length > before.grafcets.length) return 'grafcets';
  for (const g of after.grafcets) {
    const n = stats(g).steps;
    if (n <= limits.steps) continue;
    const was = before.grafcets.find((x) => x.id === g.id);
    if (!was || n > stats(was).steps) return 'steps';
  }
  return null;
}

/** Limite dépassée par un projet entier (import) : on refuse un import qui ne respecte pas les limites. */
export function overLimit(p: Project, limits: Limits | null): LimitKind | null {
  if (!limits) return null;
  if (p.grafcets.length > limits.grafcets) return 'grafcets';
  return p.grafcets.some((g) => stats(g).steps > limits.steps) ? 'steps' : null;
}
