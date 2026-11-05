import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  allowedInsertions, canUnwrapBlock, canWrapInBlock, checkSeq, insertAt, INSERT_KINDS, locate, moveBranch, newGrafcet,
  removeItem, unwrapBlock, validateGrafcet, walkAll, wrapInBlock, type Block, type Grafcet, type Project,
} from '../src';
import { demoProject } from './helpers';

const blockOf = (g: Grafcet, kind: 'or' | 'and') => g.items.find((i) => i.kind === kind) as Block;
const kinds = (g: Grafcet, id: string, where: 'before' | 'after') => allowedInsertions(g, id, where).map((o) => o.kind);

describe('insertion avant', () => {
  it('avant une étape : transition + étape intercalaire, valide', () => {
    const P = demoProject();
    const g = P.grafcets[1]!; // s0 t s1 t s2 t jump
    const s1 = g.items[2]!;
    expect(kinds(g, s1.id, 'before')).toContain('step');
    const n = g.items.length;
    insertAt(P, g, s1.id, 'step', 'before');
    expect(g.items.length).toBe(n + 2);
    expect(checkSeq(g.items, 'root')).toBeNull();
    // le nouvel élément est inséré entre la transition 1 et l'étape 1
    expect(g.items.indexOf(s1)).toBe(4);
  });
  it('avant l’étape initiale : insertion en tête de séquence', () => {
    const P = demoProject();
    const g = P.grafcets[1]!;
    expect(kinds(g, g.items[0]!.id, 'before').length).toBeGreaterThan(0);
    insertAt(P, g, g.items[0]!.id, 'step', 'before');
    expect(g.items[0]!.kind).toBe('step');
    expect(checkSeq(g.items, 'root')).toBeNull();
  });
  it('la barre de divergence permet d’insérer avant le bloc, la convergence après', () => {
    const P = demoProject();
    const g = P.grafcets[0]!;
    const or = blockOf(g, 'or');
    expect(allowedInsertions(g, or.id + ':d', 'after')).toEqual([]);
    expect(allowedInsertions(g, or.id, 'before')).toEqual([]);
    expect(kinds(g, or.id + ':d', 'before').length).toBeGreaterThan(0);
    const before = g.items.indexOf(or);
    insertAt(P, g, or.id + ':d', 'trans', 'before');
    expect(g.items.indexOf(or)).toBeGreaterThan(before);
    expect(checkSeq(g.items, 'root')).toBeNull();
  });
  it('refuse un renvoi avant un élément qui n’est pas en fin de séquence', () => {
    const g = demoProject().grafcets[1]!;
    expect(kinds(g, g.items[2]!.id, 'before')).not.toContain('jump');
  });
});

describe('encadrer dans une divergence', () => {
  it('une transition devient deux transitions alternatives', () => {
    const P = demoProject();
    const g = P.grafcets[1]!;
    const t = g.items[1]!;
    const r = wrapInBlock(P, g, t.id, 'or')!;
    expect(r).not.toBeNull();
    const b = g.items[1] as Block;
    expect(b.kind).toBe('or');
    expect(b.branches[0]).toEqual([t]);
    expect(b.branches[1]!.length).toBe(1);
    expect(checkSeq(g.items, 'root')).toBeNull();
  });
  it('une étape entourée de ses transitions peut être contournée (saut d’étapes)', () => {
    const P = demoProject();
    const g = P.grafcets[1]!; // s0 t1 s1 t2 s2 t3 jump
    const s1 = g.items[2]!;
    expect(canWrapInBlock(g, s1.id, 'or')).toBe(true);
    const r = wrapInBlock(P, g, s1.id, 'or')!;
    const b = g.items.find((i) => i.kind === 'or') as Block;
    expect(b.branches[0]!.map((i) => i.kind)).toEqual(['trans', 'step', 'trans']);
    expect(b.branches[1]![0]!.id).toBe(r.firstId);
    expect(checkSeq(g.items, 'root')).toBeNull();
  });
  it('une étape peut être doublée en parallèle (ET)', () => {
    const P = demoProject();
    const g = P.grafcets[1]!;
    const s1 = g.items[2]!;
    wrapInBlock(P, g, s1.id, 'and');
    const b = g.items.find((i) => i.kind === 'and') as Block;
    expect(b.branches[0]).toEqual([s1]);
    expect(b.branches[1]![0]!.kind).toBe('step');
    expect(checkSeq(g.items, 'root')).toBeNull();
  });
  it('refuse quand aucune plage ne convient et ne modifie rien', () => {
    const P = demoProject();
    const g = P.grafcets[2]!; // une seule étape
    const before = JSON.stringify([P, g]);
    expect(canWrapInBlock(g, g.items[0]!.id, 'or')).toBe(false);
    expect(wrapInBlock(P, g, g.items[0]!.id, 'or')).toBeNull();
    expect(JSON.stringify([P, g])).toBe(before);
  });
});

describe('dissoudre et déplacer', () => {
  it('encadrer puis dissoudre en gardant la branche d’origine redonne le GRAFCET initial', () => {
    const P = demoProject();
    const g = P.grafcets[1]!;
    const initial = JSON.stringify(g.items);
    wrapInBlock(P, g, g.items[2]!.id, 'or');
    const b = g.items.find((i) => i.kind === 'or') as Block;
    expect(canUnwrapBlock(g, b.id, 0)).toBe(true);
    expect(unwrapBlock(g, b.id, 0)).not.toBeNull();
    expect(JSON.stringify(g.items)).toBe(initial);
  });
  it('refuse une dissolution qui casserait la grammaire', () => {
    const P = demoProject();
    const g = P.grafcets[0]!;
    const and = blockOf(g, 'and');
    const before = JSON.stringify(g.items);
    // la branche ET garde des étapes, mais le bloc OU est suivi d’une étape : on teste une branche invalide
    const or = blockOf(g, 'or');
    or.branches[1]!.push({ id: 'jj', kind: 'jump', target: g.items[0]!.id }); // branche terminée par un renvoi
    const bad = JSON.stringify(g.items);
    expect(unwrapBlock(g, or.id, 1)).toBeNull(); // le renvoi ne serait plus en fin de séquence
    expect(JSON.stringify(g.items)).toBe(bad);
    expect(before).not.toBe(bad);
    expect(and.branches.length).toBe(2);
  });
  it('déplace une branche vers la gauche ou la droite, sans dépasser les bords', () => {
    const P = demoProject();
    const g = P.grafcets[0]!;
    const or = blockOf(g, 'or');
    const [a, b] = or.branches;
    const idInA = a![0]!.id;
    expect(moveBranch(g, idInA, -1)).toBe(false);
    expect(moveBranch(g, idInA, 1)).toBe(true);
    expect(or.branches).toEqual([b, a]);
    expect(moveBranch(g, idInA, 1)).toBe(false);
    expect(checkSeq(g.items, 'root')).toBeNull();
  });
});

describe('propriété : toutes les opérations gardent un GRAFCET valide', () => {
  const ops = fc.array(
    fc.record({
      pick: fc.nat(1000), op: fc.constantFrom('insA', 'insB', 'wrapOr', 'wrapAnd', 'unwrap', 'move', 'remove'),
      kind: fc.nat(INSERT_KINDS.length - 1), n: fc.nat(3), left: fc.boolean(),
    }),
    { maxLength: 80 },
  );
  it('insertion avant/après, encadrer, dissoudre, déplacer, supprimer', () => {
    fc.assert(
      fc.property(ops, (list) => {
        const P: Project = { name: 'p', counter: 1, gcount: 1, grafcets: [] };
        const g = newGrafcet(P, 'g');
        P.grafcets.push(g);
        for (const o of list) {
          const ids: string[] = [];
          walkAll(g.items, (it) => ids.push(it.id));
          if (!ids.length) return true;
          const id = ids[o.pick % ids.length]!;
          const kind = INSERT_KINDS[o.kind]!;
          if (o.op === 'insA' || o.op === 'insB') {
            const where = o.op === 'insA' ? 'after' : 'before';
            const target = where === 'before' && locate(g.items, id)?.item.kind && (locate(g.items, id)!.item as { branches?: unknown }).branches ? id + ':d' : id;
            if (allowedInsertions(g, target, where).some((x) => x.kind === kind)) insertAt(P, g, target, kind, where);
          } else if (o.op === 'wrapOr' || o.op === 'wrapAnd') {
            const k = o.op === 'wrapOr' ? 'or' : 'and';
            const can = canWrapInBlock(g, id, k);
            const r = wrapInBlock(P, g, id, k);
            if (can !== (r !== null)) return false;
          } else if (o.op === 'unwrap') {
            const l = locate(g.items, id);
            if (l && (l.item.kind === 'or' || l.item.kind === 'and')) {
              const keep = o.n % l.item.branches.length;
              const can = canUnwrapBlock(g, id, keep);
              const r = unwrapBlock(g, id, keep);
              if (can !== (r !== null)) return false;
            }
          } else if (o.op === 'move') {
            moveBranch(g, id, o.left ? -1 : 1);
          } else removeItem(g, id);
          if (checkSeq(g.items, 'root') !== null) return false;
          // ids uniques
          const seen = new Set<string>();
          let dup = false;
          walkAll(g.items, (it) => { if (seen.has(it.id)) dup = true; seen.add(it.id); });
          if (dup) return false;
        }
        return validateGrafcet(g).every((i) => i.key !== 'v_structure');
      }),
      { numRuns: 300 },
    );
  });
});
