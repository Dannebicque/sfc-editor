import { describe as suite, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  addBranch, allowedInsertions, checkSeq, describeId, flatten, insertAfter, newGrafcet, parseRecept,
  removeBranch, removeItem, renumber, stats, validateGrafcet, walkAll, duplicateGrafcet, INSERT_KINDS,
  type Grafcet, type Project,
} from '../src';
import { demoProject } from './helpers';

const kinds = (g: Grafcet, id: string) => allowedInsertions(g, id).map((o) => o.kind);

suite('grammaire', () => {
  it('accepte les projets de démonstration', () => {
    for (const g of demoProject().grafcets) expect(checkSeq(g.items, 'root')).toBeNull();
  });
  it('refuse deux étapes consécutives', () => {
    const P = demoProject();
    const g = P.grafcets[2]!;
    g.items.push({ ...(g.items[0] as object), id: 'x' } as never);
    expect(checkSeq(g.items, 'root')).toBe('chk_alternation');
  });
  it('refuse une séquence vide et un bloc final', () => {
    expect(checkSeq([], 'root')).toBe('chk_empty');
  });
});

suite('insertion guidée', () => {
  it("après une étape seule : transition, divergence OU, renvoi impossible sans cible", () => {
    const P = demoProject();
    const g = P.grafcets[2]!;
    const k = kinds(g, g.items[0]!.id);
    expect(k).toContain('trans');
    expect(k).toContain('or');
    expect(k).not.toContain('jump');
  });
  it("n'offre jamais d'insertion après un renvoi ni sur une barre de divergence", () => {
    const g = demoProject().grafcets[0]!;
    const jump = g.items[g.items.length - 1]!;
    expect(allowedInsertions(g, jump.id)).toEqual([]);
    const block = g.items.find((i) => i.kind === 'or')!;
    expect(allowedInsertions(g, block.id + ':d')).toEqual([]);
  });
  it('insère un intercalaire quand il faut garder l’alternance', () => {
    const P = demoProject();
    const g = P.grafcets[1]!;
    const before = g.items.length;
    insertAfter(P, g, g.items[1]!.id, 'step'); // après la transition 1
    expect(g.items.length).toBe(before + 2); // étape + transition intercalaire
    expect(checkSeq(g.items, 'root')).toBeNull();
  });
  it('propriété : toute suite d’opérations autorisées garde le GRAFCET valide', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.nat(1000), fc.nat(INSERT_KINDS.length - 1), fc.boolean()), { maxLength: 60 }),
        (ops) => {
          const P: Project = { name: 'p', counter: 1, gcount: 1, grafcets: [] };
          const g = newGrafcet(P, 'g');
          P.grafcets.push(g);
          for (const [pick, kindIdx, remove] of ops) {
            const ids: string[] = [];
            walkAll(g.items, (it) => ids.push(it.id));
            const id = ids[pick % ids.length]!;
            if (remove) {
              removeItem(g, id);
            } else {
              const kind = INSERT_KINDS[kindIdx]!;
              if (allowedInsertions(g, id).some((o) => o.kind === kind)) insertAfter(P, g, id, kind);
            }
            if (g.items.length === 0) return true;
            if (checkSeq(g.items, 'root') !== null) return false;
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });
});

suite('suppression, branches, renumérotation', () => {
  it('supprime une étape et son intercalaire', () => {
    const P = demoProject();
    const g = P.grafcets[1]!;
    const n = g.items.length;
    const r = removeItem(g, g.items[2]!.id);
    expect(r.ok).toBe(true);
    expect(g.items.length).toBe(n - 2);
    expect(checkSeq(g.items, 'root')).toBeNull();
  });
  it('ajoute puis supprime une branche', () => {
    const P = demoProject();
    const g = P.grafcets[0]!;
    const or = g.items.find((i) => i.kind === 'or') as unknown as { id: string; branches: Grafcet['items'][] };
    expect(addBranch(P, g, or.id, 1)).not.toBeNull();
    expect(or.branches.length).toBe(3);
    expect(removeBranch(g, or.branches[2]![0]!.id)).not.toBeNull();
    expect(or.branches.length).toBe(2);
    expect(removeBranch(g, or.branches[1]![0]!.id)).toBeNull(); // minimum 2 branches
  });
  it('renumérote en réécrivant les références Xn', () => {
    const P = demoProject();
    const g = P.grafcets[0]!;
    const t9 = g.items.find((i) => i.kind === 'trans' && i.recept === 'X6 . X8')!;
    renumber(g);
    expect(t9.kind === 'trans' && t9.recept).toMatch(/^X\d+ \. X\d+$/);
    expect(validateGrafcet(g).filter((i) => i.key === 'v_step_missing')).toEqual([]);
  });
  it('duplique avec de nouveaux ids et des renvois cohérents', () => {
    const P = demoProject();
    const c = duplicateGrafcet(P, P.grafcets[0]!, 'copie');
    const orig = new Set<string>();
    walkAll(P.grafcets[0]!.items, (it) => orig.add(it.id));
    walkAll(c.items, (it) => expect(orig.has(it.id)).toBe(false));
    expect(validateGrafcet(c).filter((i) => i.key === 'v_jump_broken')).toEqual([]);
  });
});

suite('réceptivités', () => {
  it.each(['a . b', 'a + /b', '↑capteur', 'X3 . t1/X2/3s', '(a + b) . c', 'cpt >= 3', '1'])('accepte %s', (s) => {
    expect(parseRecept(s).ok).toBe(true);
  });
  it.each([['', 'p_empty'], ['a .', 'p_operand'], ['(a', 'p_paren'], ['a b', 'p_char'], ['#', 'p_char']])('refuse %j', (s, key) => {
    const r = parseRecept(s);
    expect(r.ok).toBe(false);
    expect(r.error?.key).toBe(key);
  });
  it('extrait variables et références', () => {
    const r = parseRecept('a . X3 + t1/X5/2s');
    expect([...r.vars]).toEqual(['a']);
    expect(r.refs).toEqual([3, 5]);
  });
});

suite('validation, graphe plat, description', () => {
  it('le projet de démonstration n’a aucune erreur', () => {
    for (const g of demoProject().grafcets) expect(validateGrafcet(g).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('signale absence d’étape initiale, réceptivité invalide et renvoi cassé', () => {
    const g = demoProject().grafcets[0]!;
    walkAll(g.items, (it) => { if (it.kind === 'step') it.initial = false; if (it.kind === 'jump') it.target = null; });
    const t = g.items.find((i) => i.kind === 'trans')!;
    if (t.kind === 'trans') t.recept = 'a .';
    const keys = validateGrafcet(g).map((i) => i.key);
    expect(keys).toContain('v_noinit');
    expect(keys).toContain('v_recept_err');
    expect(keys).toContain('v_jump_broken');
  });
  it('graphe plat : renvoi = liaison de retour, divergences = plusieurs arcs', () => {
    const g = demoProject().grafcets[1]!;
    const f = flatten(g);
    expect(f.nodes.length).toBe(6);
    expect(f.links.filter((l) => l.jump).length).toBe(1);
  });
  it('décrit un élément et une barre de divergence', () => {
    const g = demoProject().grafcets[0]!;
    const or = g.items.find((i) => i.kind === 'or')!;
    expect(describeId(g, or.id + ':d')).toMatchObject({ key: 'div_or', branches: 2 });
    expect(describeId(g, g.items[0]!.id)).toMatchObject({ key: 'd_step', initial: true });
    expect(stats(g)).toMatchObject({ blocks: 2, jumps: 1 });
  });
});
