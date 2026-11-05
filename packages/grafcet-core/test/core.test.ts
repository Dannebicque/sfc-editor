import { describe as suite, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  addBranch, allowedInsertions, checkSeq, describeId, flatten, insertAfter, newGrafcet, parseRecept,
  createExpansion, provablyExclusive, referencesTo, setMacro, removeBranch, removeItem, renumber, stats, validateGrafcet, walkAll, duplicateGrafcet, INSERT_KINDS,
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
    expect(r.refs).toEqual(['3', '5']);
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

suite('identifiants d’étapes textuels', () => {
  const known = new Set(['INIT', 'X7', '12']);
  it('reconnaît un identifiant connu, avec ou sans préfixe X', () => {
    const r = parseRecept('INIT.X12./Auto+X7', known);
    expect(r.ok).toBe(true);
    expect(r.refs).toEqual(['INIT', '12', 'X7']);
    expect([...r.vars]).toEqual(['Auto']);
  });
  it('sans contexte, seuls les Xn entiers sont des références', () => {
    const r = parseRecept('INIT.X12');
    expect(r.refs).toEqual(['12']);
    expect([...r.vars]).toEqual(['INIT']);
  });
});

suite('profils de vérification', () => {
  it('démontre l’exclusion mutuelle seulement quand elle est certaine', () => {
    expect(provablyExclusive('a', '/a')).toBe(true);
    expect(provablyExclusive('a.b', '/a')).toBe(true);
    expect(provablyExclusive('a+b', '/a./b')).toBe(true);
    expect(provablyExclusive('a', 'b')).toBe(false);
    expect(provablyExclusive('a+b', '/a')).toBe(false);
    expect(provablyExclusive('(a)', '/a')).toBe(false); // trop complexe : non démontré
  });
  const build = (recA: string, recB: string): Grafcet => ({
    id: 'g', name: 'g', nextStep: 3, nextTrans: 4,
    items: [
      { id: 's0', kind: 'step', num: '0', name: '', initial: true, actions: [{ kind: 'continue', label: 'Ouvrir vanne', cond: '' }] },
      { id: 'o', kind: 'or', branches: [
        [{ id: 't1', kind: 'trans', num: 1, recept: recA }, { id: 's1', kind: 'step', num: '1', name: '', initial: false, actions: [] }],
        [{ id: 't2', kind: 'trans', num: 2, recept: recB }, { id: 's2', kind: 'step', num: '2', name: '', initial: false, actions: [] }],
      ] },
      { id: 't3', kind: 'trans', num: 3, recept: '↑a' },
      { id: 'j', kind: 'jump', target: 't1' },
    ],
  });
  it('grafcet : signale une divergence OU non exclusive, pas les contrôles propres à l’automate', () => {
    const k = (rec: string) => validateGrafcet(build('a', rec), { profile: 'grafcet' }).map((i) => i.key);
    expect(k('b')).toContain('v_or_exclusive');
    expect(k('/a')).not.toContain('v_or_exclusive');
    expect(k('/a')).not.toContain('v_sfc_edge');
    expect(k('/a')).not.toContain('v_sfc_jump_trans');
  });
  it('sfc : signale renvoi vers une transition, front et identifiant invalide ; plcopen ajoute les actions conditionnelles', () => {
    const keys = validateGrafcet(build('a', 'b'), { profile: 'sfc' }).map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(['v_sfc_jump_trans', 'v_sfc_edge', 'v_sfc_ident']));
    expect(keys).not.toContain('v_or_exclusive');
    const g = build('a', 'b');
    (g.items[0] as { actions: { kind: string }[] }).actions[0]!.kind = 'conditional';
    expect(validateGrafcet(g, { profile: 'sfc' }).map((i) => i.key)).not.toContain('v_plc_cond_action');
    expect(validateGrafcet(g, { profile: 'plcopen' }).map((i) => i.key)).toContain('v_plc_cond_action');
  });
});

suite('références à une étape', () => {
  it('trouve les transitions et actions conditionnelles qui citent une étape', () => {
    const P = demoProject();
    const g = P.grafcets[0]!;
    const known = new Set<string>();
    for (const gg of P.grafcets) walkAll(gg.items, (i) => { if (i.kind === 'step') known.add(i.num); });
    const trans = g.items.find((i) => i.kind === 'trans')!;
    if (trans.kind !== 'trans') throw new Error();
    trans.recept = 'a.X3+/b';
    expect(referencesTo(g, '3', known)).toContain(trans.id);
    expect(referencesTo(g, '4', known)).not.toContain(trans.id);
  });
});

suite('macro-étapes', () => {
  const mk = () => {
    const P = demoProject();
    const g = P.grafcets[0]!;
    const step = g.items.find((i) => i.kind === 'step' && !i.initial)!;
    return { P, g, step };
  };
  it('une macro sans expansion est une erreur ; l’expansion créée est valide', () => {
    const { P, g, step } = mk();
    expect(setMacro(g, step.id, true)).toBe(true);
    expect(validateGrafcet(g, { project: P }).map((i) => i.key)).toContain('v_macro_no_expansion');
    const x = createExpansion(P, g, step.id, 'Expansion')!;
    expect(x.items.map((i) => i.kind)).toEqual(['step', 'trans', 'step']);
    expect(validateGrafcet(g, { project: P }).map((i) => i.key)).not.toContain('v_macro_no_expansion');
    const k = validateGrafcet(x, { project: P }).map((i) => i.key);
    expect(k).not.toContain('v_noinit');
    expect(k).not.toContain('v_dead_end');
    expect(k).not.toContain('v_unreachable');
    expect(k).not.toContain('v_expansion_entry');
  });
  it('détecte une expansion sans sortie et une macro qui se contient elle-même', () => {
    const { P, g, step } = mk();
    setMacro(g, step.id, true);
    const x = createExpansion(P, g, step.id, 'Expansion')!;
    (x.items[2] as { role?: string }).role = undefined;
    expect(validateGrafcet(x, { project: P }).map((i) => i.key)).toContain('v_expansion_exit');
    // l'expansion contient une macro qui renvoie au GRAFCET de départ
    (x.items[2] as { role?: string }).role = 'exit';
    const inner = x.items[2] as { expansion?: string | null };
    inner.expansion = g.id;
    expect(validateGrafcet(g, { project: P }).map((i) => i.key)).toContain('v_macro_cycle');
  });
});

suite('actions sur événement', () => {
  const mk = (kind: 'event' | 'continue', cond: string, label: string) => {
    const P = demoProject();
    const g = P.grafcets[0]!;
    const s = g.items.find((i) => i.kind === 'step')! as { actions: unknown[] };
    s.actions = [{ kind, label, cond }];
    return { P, g };
  };
  it('avertit si l’événement n’a pas de front', () => {
    const { g } = mk('event', 'a', 'B:=1');
    expect(validateGrafcet(g).map((i) => i.key)).toContain('v_event_no_edge');
  });
  it('accepte un front et signale une affectation continue', () => {
    const ok = mk('event', '↑a', 'B:=1');
    expect(validateGrafcet(ok.g).map((i) => i.key)).not.toContain('v_event_no_edge');
    const bad = mk('continue', '', 'B:=1');
    expect(validateGrafcet(bad.g).map((i) => i.key)).toContain('v_assign_continuous');
  });
});
