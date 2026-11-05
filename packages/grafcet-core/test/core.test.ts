import { describe as suite, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  addBranch, allowedInsertions, insertAt, checkSeq, describeId, flatten, insertAfter, newGrafcet, parseRecept,
  createExpansion, provablyExclusive, referencesTo, syncLinks, setMacro, removeBranch, removeItem, renumber, stats, validateGrafcet, walkAll, duplicateGrafcet, INSERT_KINDS,
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

suite('transitions source et puits', () => {
  it('accepte une séquence commençant ou finissant par une transition', () => {
    const t = (id: string, n: number) => ({ id, kind: 'trans' as const, num: n, recept: 'a' });
    const s = (id: string, n: string, initial = false) => ({ id, kind: 'step' as const, num: n, name: '', initial, actions: [] });
    expect(checkSeq([t('t1', 1), s('s1', '1'), t('t2', 2)], 'root')).toBeNull();
    expect(checkSeq([t('t1', 1), s('s1', '1')], 'or')).not.toBeNull();
  });
  it('ne signale ni absence d’étape initiale ni bout de ligne', () => {
    const P = demoProject();
    const g = newGrafcet(P, 'src');
    g.items = [
      { id: 'a', kind: 'trans', num: 1, recept: 'a' },
      { id: 'b', kind: 'step', num: '1', name: '', initial: false, actions: [] },
      { id: 'c', kind: 'trans', num: 2, recept: 'b' },
    ];
    const keys = validateGrafcet(g).map((i) => i.key);
    expect(keys).not.toContain('v_noinit');
    expect(keys).not.toContain('v_dead_end');
    expect(keys).not.toContain('v_unreachable');
  });
  it('propose l’insertion d’une transition avant la première étape', () => {
    const P = demoProject();
    const g = P.grafcets[0]!;
    const first = g.items[0]!;
    expect(allowedInsertions(g, first.id, 'before').map((i) => i.kind)).toContain('trans');
  });
});

suite('synchronisations', () => {
  it('liste les étapes testées dans un autre GRAFCET, pas celles du même', () => {
    const P = demoProject();
    const a = P.grafcets[0]!, b = P.grafcets[1]!;
    const stepB = b.items.find((i) => i.kind === 'step')! as { num: string };
    stepB.num = 'SYNC';
    const tA = a.items.find((i) => i.kind === 'trans')! as { recept: string };
    tA.recept = 'X' + stepB.num;
    const known = new Set<string>();
    for (const g of P.grafcets) walkAll(g.items, (it) => { if (it.kind === 'step') known.add(it.num); });
    const links = syncLinks(P, known);
    expect(links.some((l) => l.from === a.id && l.num === stepB.num && l.in.includes(b.id))).toBe(true);
  });
});

suite('enchaînement OU / ET', () => {
  const S = (id: string, n: string, initial = false) => ({ id, kind: 'step' as const, num: n, name: '', initial, actions: [] });
  const T = (id: string, n: number) => ({ id, kind: 'trans' as const, num: n, recept: 'a' });
  const seq = (): Grafcet['items'] => [
    S('s0', '0', true),
    { id: 'o', kind: 'or', branches: [
      [{ id: 'a', kind: 'and', branches: [[S('s1', '1')], [S('s2', '2')]] }, T('t9', 9)],
      [T('t1', 1), S('s3', '3'), { id: 'o2', kind: 'or', branches: [[T('t2', 2)], [T('t3', 3)]] }, S('s4', '4'), T('t5', 5)],
    ] },
    S('s7', '7'), T('t0', 0),
  ];
  it('accepte un ET en tête de branche OU, et un OU en tête de branche ET', () => {
    expect(checkSeq(seq(), 'root')).toBeNull();
    const inv: Grafcet['items'] = [
      S('s0', '0', true), T('t1', 1),
      { id: 'a', kind: 'and', branches: [[{ id: 'o', kind: 'or', branches: [[T('t2', 2)], [T('t3', 3)]] }, S('s5', '5')], [S('s6', '6')]] },
      T('t0', 0),
    ];
    expect(checkSeq(inv, 'root')).toBeNull();
  });
  it('relie la divergence OU directement aux étapes de la divergence ET', () => {
    const P = demoProject();
    const g = newGrafcet(P, 'x');
    g.items = seq();
    const links = flatten(g).links.filter((l) => l.from === 's0').map((l) => l.to).sort();
    expect(links).toEqual(['s1', 's2', 't1']);
  });
  it('propose un ET juste après la divergence OU', () => {
    const P = demoProject();
    const g = newGrafcet(P, 'x');
    g.items = [S('s0', '0', true), { id: 'o', kind: 'or', branches: [[T('t1', 1)], [T('t2', 2)]] }, S('s9', '9')];
    expect(allowedInsertions(g, 't1', 'before').map((i) => i.kind)).toContain('and');
  });
});

suite('renvoi dans une branche ET', () => {
  const S = (id: string, n: string, initial = false) => ({ id, kind: 'step' as const, num: n, name: '', initial, actions: [] });
  const T = (id: string, n: number) => ({ id, kind: 'trans' as const, num: n, recept: 'a' });
  const mk = (b2: Grafcet['items']): Grafcet['items'] => [
    S('s0', '0', true), T('t1', 1),
    { id: 'a', kind: 'and', branches: [[S('s3', '3')], b2] }, T('t2', 2), S('s4', '4'), T('t3', 3),
  ];
  it('accepte une branche réduite à un renvoi', () => {
    const items = mk([{ id: 'j', kind: 'jump', target: 's0' }]);
    expect(checkSeq(items, 'root')).toBeNull();
    const P = demoProject();
    const g = newGrafcet(P, 'x');
    g.items = items;
    const l = flatten(g).links;
    expect(l).toContainEqual({ from: 't1', to: 's0', jump: true });
    expect(l.filter((x) => x.to === 't2').map((x) => x.from)).toEqual(['s3']);
  });
  it('refuse un ET dont toutes les branches se terminent par un renvoi', () => {
    const items = mk([{ id: 'j', kind: 'jump', target: 's0' }]);
    (items[2] as { branches: Grafcet['items'][] }).branches[0] = [{ id: 'j2', kind: 'jump', target: 's0' }];
    expect(checkSeq(items, 'root')).toBe('chk_and_all_jump');
  });
});

suite('saisie d’un renvoi dans une branche ET', () => {
  it('remplace l’étape vide d’une branche par un renvoi', () => {
    const P = demoProject();
    const g = newGrafcet(P, 'x');
    const S = (id: string, n: string, initial = false) => ({ id, kind: 'step' as const, num: n, name: '', initial, actions: [] });
    g.items = [S('s0', '0', true), { id: 't1', kind: 'trans', num: 1, recept: 'a' },
      { id: 'a', kind: 'and', branches: [[S('s1', '1')], [S('s2', '2')]] }, { id: 't2', kind: 'trans', num: 2, recept: 'b' }];
    expect(allowedInsertions(g, 's2', 'after').map((i) => i.kind)).toContain('jump');
    const id = insertAt(P, g, 's2', 'jump', 'after');
    expect((g.items[2] as { branches: Grafcet['items'][] }).branches[1]).toEqual([expect.objectContaining({ id, kind: 'jump', target: 's0' })]);
    expect(checkSeq(g.items, 'root')).toBeNull();
    // la dernière branche convergente ne peut pas devenir un renvoi
    expect(allowedInsertions(g, 's1', 'after').find((i) => i.kind === 'jump')?.noteKey ?? null).not.toBe('note_jump_replace');
  });
});
