import type { Issue } from './validate';
import { indexOf, first, nodesOf } from './graph';
import type { Grafcet, Node } from './types';

/**
 * Profils de vérification. Les règles communes (structure, doublons, références, accessibilité du graphe…) s'appliquent
 * toujours ; chaque profil y ajoute les contrôles propres à son usage.
 *  - `grafcet` : GRAFCET comme langage de spécification (IEC 60848) ;
 *  - `sfc`     : SFC d'automate (IEC 61131-3) ;
 *  - `plcopen` : SFC destiné à l'export PLCopen XML (règles `sfc` + limites de l'export).
 */
export type ValidationProfile = 'grafcet' | 'sfc' | 'plcopen';
export const PROFILES: readonly ValidationProfile[] = ['grafcet', 'sfc', 'plcopen'];
export const DEFAULT_PROFILE: ValidationProfile = 'grafcet';
export const isProfile = (v: unknown): v is ValidationProfile => PROFILES.includes(v as ValidationProfile);

/** Littéraux d'une réceptivité écrite en forme normale simple (OU de ET de littéraux) ; null si trop complexe pour l'analyse. */
function terms(src: string): { pos: Set<string>; neg: Set<string> }[] | null {
  const s = src.replace(/\s+/g, '');
  if (!s || /[()↑↓^<>=!]/.test(s)) return null;
  return s.split('+').map((t) => {
    const pos = new Set<string>(), neg = new Set<string>();
    for (const lit of t.split(/[.·*&]/)) {
      if (!lit) continue;
      if (lit[0] === '/') neg.add(lit.slice(1)); else pos.add(lit);
    }
    return { pos, neg };
  });
}

/** Vrai seulement si l'exclusion mutuelle est démontrée (un littéral et son complément dans chaque paire de termes). */
export function provablyExclusive(a: string, b: string): boolean {
  const ta = terms(a), tb = terms(b);
  if (!ta || !tb) return false;
  return ta.every((x) => tb.every((y) => [...x.pos].some((l) => y.neg.has(l)) || [...x.neg].some((l) => y.pos.has(l))));
}

const IEC_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function profileIssues(g: Grafcet, profile: ValidationProfile): Issue[] {
  const issues: Issue[] = [];
  const ix = indexOf(g);

  if (profile === 'grafcet') {
    for (const l of g.links) {
      if (l.kind !== 'div' || l.op !== 'or') continue;
      const firsts = l.nodes.map((n) => first(ix.seq.get(n))).filter((x): x is Extract<Node, { kind: 'trans' }> => !!x && x.kind === 'trans' && !!x.recept.trim());
      for (let i = 0; i < firsts.length; i++) {
        const j = firsts.findIndex((t, k) => k > i && !provablyExclusive(firsts[i]!.recept, t.recept));
        if (j >= 0) { issues.push({ level: 'warning', key: 'v_or_exclusive', params: { a: firsts[i]!.num, b: firsts[j]!.num }, id: l.id }); break; }
      }
    }
    return issues;
  }

  // sfc et plcopen
  for (const j of g.jumps) if (j.to && ix.node.get(j.to)?.item.kind === 'trans') issues.push({ level: 'error', key: 'v_sfc_jump_trans', id: j.id });
  for (const it of nodesOf(g)) {
    if (it.kind === 'trans' && /[↑↓^]/.test(it.recept)) issues.push({ level: 'warning', key: 'v_sfc_edge', params: { n: it.num }, id: it.id });
    if (it.kind === 'step') {
      for (const a of it.actions) {
        const label = a.label.trim();
        if (label && !IEC_IDENT.test(label)) issues.push({ level: 'warning', key: 'v_sfc_ident', params: { n: it.num, v: label }, id: it.id });
        if (profile === 'plcopen' && (a.kind === 'conditional' || a.kind === 'event')) issues.push({ level: 'warning', key: 'v_plc_cond_action', params: { n: it.num }, id: it.id });
      }
    }
  }
  return issues;
}
