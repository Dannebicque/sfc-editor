import { describe as suite, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  addBranch, addConvergence, addDivergence, addJump, capabilities, checkGraph, connect, createExpansion, describeId, docOrder, duplicateGrafcet,
  flatten, tidy, indexOf, insertNode, mergeEnds, mergeStarts, migrateProject, newGrafcet, nodesOf, parseRecept, provablyExclusive, referencesTo,
  removeBranch, removeJump, removeLink, removeNode, renumber, setMacro, stats, syncLinks, treeToGraph, validateGrafcet,
  type Grafcet, type Node, type Project, type TreeGrafcet,
} from '../src';
import { demoProject } from './helpers';

const S = (id: string, n: string, initial = false): Node => ({ id, kind: 'step', num: n, name: '', initial, actions: [] });
const T = (id: string, n: number, recept = 'a'): Node => ({ id, kind: 'trans', num: n, recept });
const proj = (): Project => ({ name: 'p', counter: 100, gcount: 1, grafcets: [] });
const keys = (g: Grafcet, o = {}) => validateGrafcet(g, o).map((i) => i.key);
const nid = (g: Grafcet, num: string | number) => nodesOf(g).find((n) => String(n.num) === String(num))!.id;

suite('structure', () => {
  it('accepte les projets de démonstration', () => {
    for (const g of demoProject().grafcets) expect(checkGraph(g)).toBeNull();
  });
  it('refuse deux étapes consécutives, un lien à une branche, un cycle', () => {
    const g = demoProject().grafcets[0]!;
    g.seqs[0]!.items.splice(1, 1);
    expect(checkGraph(g)).toBe('chk_alternation');
    const h = demoProject().grafcets[0]!;
    h.links[0]!.nodes.pop();
    expect(checkGraph(h)).toBe('chk_min_branches');
    const c = demoProject().grafcets[0]!;
    c.links.push({ id: 'lx', kind: 'conv', op: 'and', base: c.links[0]!.base, nodes: [c.seqs[4]!.id, c.seqs[5]!.id] });
    expect(checkGraph(c)).not.toBeNull();
  });
  it('vérifie les types aux deux extrémités d’un lien', () => {
    const g = demoProject().grafcets[0]!;
    g.links[0]!.op = 'and'; // base finie par une étape, branches commençant par une transition
    expect(checkGraph(g)).toBe('chk_div_and_base');
  });
  it('graphe plat : renvoi = liaison de retour, liens = plusieurs arcs', () => {
    const g = demoProject().grafcets[1]!;
    const f = flatten(g);
    expect(f.nodes.length).toBe(6);
    expect(f.links.filter((l) => l.jump).length).toBe(1);
    const g1 = demoProject().grafcets[0]!;
    const f1 = flatten(g1);
    expect(f1.links.filter((l) => l.from === nid(g1, 1) || l.to === nid(g1, 9)).length).toBeGreaterThan(2);
  });
  it('ordre du document : de haut en bas', () => {
    const g = demoProject().grafcets[0]!;
    const order = docOrder(g).map((s) => s.id);
    expect(order[0]).toBe(g.seqs[0]!.id);
    expect(order.indexOf(g.seqs[3]!.id)).toBeGreaterThan(order.indexOf(g.seqs[2]!.id));
    expect(order.length).toBe(g.seqs.length);
  });
});

suite('insertion', () => {
  it('insère un intercalaire pour garder l’alternance', () => {
    const P = proj(); const g = newGrafcet(P, 'x');
    const s0 = g.seqs[0]!.items[0]!.id;
    const id = insertNode(P, g, s0, 'step')!;
    expect(g.seqs[0]!.items.map((i) => i.kind)).toEqual(['step', 'trans', 'step']);
    expect(g.seqs[0]!.items[2]!.id).toBe(id);
    expect(checkGraph(g)).toBeNull();
  });
  it('avant l’étape initiale : transition source', () => {
    const P = proj(); const g = newGrafcet(P, 'x');
    insertNode(P, g, g.seqs[0]!.items[0]!.id, 'trans', 'before');
    expect(g.seqs[0]!.items.map((i) => i.kind)).toEqual(['trans', 'step']);
    expect(keys(g)).not.toContain('v_noinit');
  });
  it('divergence et convergence ne sont pas créées sur un renvoi', () => {
    const g = demoProject().grafcets[1]!;
    const last = g.seqs[0]!.items[5]!.id;
    expect(addDivergence(proj(), g, last, 'and')).toBeNull();
  });
});

suite('divergences et convergences', () => {
  it('OU après une étape : deux branches commençant par une transition', () => {
    const P = proj(); const g = newGrafcet(P, 'x');
    insertNode(P, g, g.seqs[0]!.items[0]!.id, 'trans');
    const s1 = insertNode(P, g, g.seqs[0]!.items[1]!.id, 'step')!;
    const first = addDivergence(P, g, s1, 'or')!;
    expect(first).toBeTruthy();
    expect(g.links).toHaveLength(1);
    expect(g.links[0]).toMatchObject({ kind: 'div', op: 'or', base: g.seqs[0]!.id });
    expect(g.seqs).toHaveLength(3);
    expect(checkGraph(g)).toBeNull();
  });
  it('ET après une transition ; un OU après une transition ajoute l’étape intercalaire', () => {
    const P = proj(); const g = newGrafcet(P, 'x');
    const t = insertNode(P, g, g.seqs[0]!.items[0]!.id, 'trans')!;
    expect(addDivergence(P, g, t, 'and')).toBeTruthy();
    expect(g.links[0]!.op).toBe('and');
    const h = newGrafcet(P, 'y');
    const t2 = insertNode(P, h, h.seqs[0]!.items[0]!.id, 'trans')!;
    expect(addDivergence(P, h, t2, 'or')).toBeTruthy();
    expect(h.seqs[0]!.items.map((i) => i.kind)).toEqual(['step', 'trans', 'step']);
  });
  it('au milieu d’une séquence : la suite devient la première branche', () => {
    const g = demoProject().grafcets[1]!;
    const P = proj();
    const before = g.seqs[0]!.items.length;
    expect(addDivergence(P, g, nid(g, 1), 'or')).toBeTruthy();
    expect(g.seqs[0]!.items.length).toBe(3);
    expect(g.links[0]!.nodes).toHaveLength(2);
    expect(nodesOf(g).length).toBeGreaterThanOrEqual(before);
    expect(checkGraph(g)).toBeNull();
    expect(g.jumps[0]!.from).not.toBe(g.seqs[0]!.id); // le renvoi suit la fin de séquence
  });
  it('convergence construite vers le haut, puis branche ajoutée', () => {
    const g = demoProject().grafcets[1]!;
    const P = proj();
    const id = addConvergence(P, g, nid(g, 2), 'or');
    expect(id).toBeTruthy();
    expect(g.links[0]).toMatchObject({ kind: 'conv', op: 'or' });
    expect(addBranch(P, g, g.links[0]!.id, 1)).toBeTruthy();
    expect(g.links[0]!.nodes).toHaveLength(3);
    expect(removeBranch(g, g.links[0]!.nodes[2]!)).not.toBeUndefined();
    expect(checkGraph(g)).toBeNull();
  });
  it('convergence sur une transition : la barre se place juste en dessous de celle-ci', () => {
    const g = demoProject().grafcets[1]!;
    const P = proj();
    const t = nid(g, 2); // transition ; l'étape suivante ouvre la base
    expect(addConvergence(P, g, t, 'or')).toBeTruthy();
    const l = g.links.find((x) => x.kind === 'conv')!;
    const head = g.seqs.find((q) => q.id === l.nodes[0])!;
    expect(head.items[head.items.length - 1]!.id).toBe(t);
    expect(checkGraph(g)).toBeNull();
  });
  it('convergence sur la dernière étape : barre juste après elle, branche en attente à côté', () => {
    for (const op of ['or', 'and'] as const) {
      const P = proj(); const g = newGrafcet(P, 'x');
      let last = g.seqs[0]!.items[0]!.id;
      for (let i = 0; i < 3; i++) { const t = insertNode(P, g, last, 'trans')!; last = insertNode(P, g, t, 'step')!; }
      const before = nodesOf(g).length;
      expect(addConvergence(P, g, last, op)).toBeTruthy();
      expect(checkGraph(g)).toBeNull();
      const l = g.links.find((x) => x.kind === 'conv')!;
      expect(l.op).toBe(op);
      const head = g.seqs.find((q) => q.id === l.nodes[0])!;
      expect(head.items.some((i) => i.id === last)).toBe(true);
      expect(nodesOf(g).length).toBeGreaterThan(before);
    }
  });
  it('un graphe importé avec une violation reste éditable sans en ajouter de nouvelle', () => {
    const P = proj(); const g = newGrafcet(P, 'x');
    const s0 = g.seqs[0]!.items[0]!.id;
    const t = insertNode(P, g, s0, 'trans')!;
    const s1 = insertNode(P, g, t, 'step')!;
    // violation héritée : convergence OU dont une branche se termine par une étape
    const a = { id: 'qa', items: [{ id: 'xa', kind: 'step' as const, num: '90', name: '', initial: false, actions: [] }] };
    const b = { id: 'qb', items: [{ id: 'xb', kind: 'step' as const, num: '91', name: '', initial: false, actions: [] }] };
    g.seqs.push(a, b);
    g.links.push({ id: 'lx', kind: 'conv', op: 'or', base: null, nodes: ['qa', 'qb'] });
    expect(checkGraph(g)).not.toBeNull();
    expect(insertNode(P, g, s1, 'trans')).toBeTruthy(); // l'édition ailleurs passe
    expect(checkGraph(g)).not.toBeNull(); // la violation héritée est toujours signalée
  });
  it('supprimer une branche jusqu’à un seul reste fusionne les séquences', () => {
    const P = proj(); const g = newGrafcet(P, 'x');
    const s0 = g.seqs[0]!.items[0]!.id;
    const t = insertNode(P, g, s0, 'trans')!;
    const s1 = insertNode(P, g, t, 'step')!;
    addDivergence(P, g, s1, 'or');
    const l = g.links[0]!;
    removeBranch(g, l.nodes[1]!);
    expect(g.links).toHaveLength(0);
    expect(g.seqs).toHaveLength(1);
    expect(checkGraph(g)).toBeNull();
  });
  it('retirer la barre détache les séquences', () => {
    const g = demoProject().grafcets[0]!;
    removeLink(g, g.links[1]!.id);
    expect(g.links).toHaveLength(3);
    expect(checkGraph(g)).toBeNull();
  });
  it('ET libre : réunit deux fins puis deux débuts', () => {
    const P = proj();
    const g: Grafcet = { id: 'g', name: 'g', nextStep: 5, nextTrans: 5, seqs: [{ id: 'a', items: [S('s1', '1', true), T('t1', 1), S('s2', '2')] }, { id: 'b', items: [S('s3', '3', true), T('t2', 2), S('s4', '4')] }], links: [], jumps: [] };
    expect(mergeEnds(P, g, 's2', 's4')).toBeTruthy();
    expect(g.links[0]).toMatchObject({ kind: 'conv', op: 'and' });
    expect(mergeEnds(P, g, 's1', 's3')).toBeNull(); // ce ne sont pas des fins
    const h: Grafcet = { id: 'h', name: 'h', nextStep: 5, nextTrans: 5, seqs: [{ id: 'a', items: [T('t1', 1), S('s2', '2')] }, { id: 'b', items: [T('t2', 2), S('s4', '4')] }], links: [], jumps: [] };
    expect(mergeStarts(P, h, 't1', 't2')).toBeTruthy();
    expect(h.links[0]).toMatchObject({ kind: 'div', op: 'or' });
  });
});

suite('connecter, renvois', () => {
  const two = (): Grafcet => ({ id: 'g', name: 'g', nextStep: 9, nextTrans: 9, seqs: [{ id: 'a', items: [S('s1', '1', true), T('t1', 1)] }, { id: 'b', items: [S('s2', '2'), T('t2', 2)] }], links: [], jumps: [] });
  it('fusionne deux séquences libres', () => {
    const g = two();
    expect(connect(proj(), g, 't1', 's2')).toBe('s2');
    expect(g.seqs).toHaveLength(1);
    expect(g.seqs[0]!.items.map((i) => i.id)).toEqual(['s1', 't1', 's2', 't2']);
  });
  it('ajoute un renvoi quand la fusion est impossible', () => {
    const g = two();
    const j = connect(proj(), g, 't1', 's1')!;
    expect(g.jumps[0]!.id).toBe(j);
    expect(connect(proj(), g, 't2', 't1')).toBeNull(); // deux transitions
  });
  it('relie une fin à une convergence existante', () => {
    const P = proj();
    const g: Grafcet = { id: 'g', name: 'g', nextStep: 9, nextTrans: 9, seqs: [
      { id: 'a', items: [S('s1', '1', true)] }, { id: 'b', items: [S('s2', '2', true)] }, { id: 'c', items: [S('s3', '3', true)] }, { id: 'd', items: [T('t1', 1), S('s4', '4')] }],
      links: [{ id: 'l1', kind: 'conv', op: 'and', base: 'd', nodes: ['a', 'b'] }], jumps: [] };
    expect(connect(P, g, 's3', 't1')).toBe('t1');
    expect(g.links[0]!.nodes).toEqual(['a', 'b', 'c']);
  });
  it('renvoi : cible choisie et retirée', () => {
    const P = proj();
    const g = demoProject().grafcets[1]!;
    const last = g.seqs[0]!.items[5]!.id;
    removeJump(g, g.jumps[0]!.id);
    const j = addJump(P, g, last)!;
    expect(g.jumps[0]).toMatchObject({ id: j, to: g.seqs[0]!.items[0]!.id });
    expect(addJump(P, g, last)).toBeNull(); // la fin est déjà prise
  });
});

suite('suppression, numérotation, copie', () => {
  it('supprime une étape et son intercalaire', () => {
    const P = proj(); const g = newGrafcet(P, 'x');
    const t = insertNode(P, g, g.seqs[0]!.items[0]!.id, 'trans')!;
    const s1 = insertNode(P, g, t, 'step')!;
    const r = removeNode(g, s1);
    expect(r.ok).toBe(true);
    expect(g.seqs[0]!.items).toHaveLength(2);
  });
  it('un renvoi vers un élément supprimé devient cassé', () => {
    const P = proj(); const g = demoProject().grafcets[1]!;
    const to = g.jumps[0]!.to!;
    const r = removeNode(g, to);
    void P;
    expect(r.ok).toBe(true);
    expect(keys(g)).toContain('v_jump_broken');
  });
  it('renumérote en réécrivant les références Xn', () => {
    const g = demoProject().grafcets[0]!;
    renumber(g);
    const t9 = nodesOf(g).find((i) => i.kind === 'trans' && /^X\d+ \. X\d+$/.test(i.recept));
    expect(t9).toBeTruthy();
    expect(validateGrafcet(g).filter((i) => i.key === 'v_step_missing')).toEqual([]);
  });
  it('duplique avec de nouveaux ids et des liens cohérents', () => {
    const P = demoProject();
    const c = duplicateGrafcet(P, P.grafcets[0]!, 'copie');
    const orig = new Set(nodesOf(P.grafcets[0]!).map((n) => n.id));
    for (const n of nodesOf(c)) expect(orig.has(n.id)).toBe(false);
    expect(checkGraph(c)).toBeNull();
    expect(validateGrafcet(c).filter((i) => i.key === 'v_jump_broken')).toEqual([]);
    expect(stats(c)).toMatchObject({ blocks: 4, jumps: 1 });
  });
});

suite('validation, description', () => {
  it('le projet de démonstration n’a aucune erreur', () => {
    for (const g of demoProject().grafcets) expect(validateGrafcet(g).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('signale absence d’étape initiale, réceptivité invalide, renvoi cassé, séquence vide', () => {
    const g = demoProject().grafcets[0]!;
    for (const n of nodesOf(g)) if (n.kind === 'step') n.initial = false;
    g.jumps[0]!.to = null;
    const t = nodesOf(g).find((i) => i.kind === 'trans')!;
    if (t.kind === 'trans') t.recept = 'a .';
    g.seqs.push({ id: 'qx', items: [] });
    const k = keys(g);
    expect(k).toEqual(expect.arrayContaining(['v_noinit', 'v_recept_err', 'v_jump_broken', 'v_empty_seq']));
  });
  it('décrit un élément, un lien, une séquence vide', () => {
    const g = demoProject().grafcets[0]!;
    expect(describeId(g, g.links[0]!.id)).toMatchObject({ key: 'div_or', branches: 2 });
    expect(describeId(g, g.links[1]!.id)).toMatchObject({ key: 'conv_or' });
    expect(describeId(g, g.seqs[0]!.items[0]!.id)).toMatchObject({ key: 'd_step', initial: true });
    expect(describeId(g, g.jumps[0]!.id)).toMatchObject({ key: 'd_jump_step' });
  });
  it('accepte une séquence qui commence ou finit par une transition', () => {
    const g: Grafcet = { id: 'g', name: 'g', nextStep: 2, nextTrans: 3, seqs: [{ id: 'q', items: [T('a', 1), S('b', '1'), T('c', 2)] }], links: [], jumps: [] };
    expect(checkGraph(g)).toBeNull();
    const k = keys(g);
    expect(k).not.toContain('v_noinit');
    expect(k).not.toContain('v_dead_end');
    expect(k).not.toContain('v_unreachable');
  });
  it('liens ouverts : divergence et convergence sans base', () => {
    const g: Grafcet = { id: 'g', name: 'g', nextStep: 5, nextTrans: 5, seqs: [
      { id: 'a', items: [S('s1', '1', true), T('t1', 1), S('s2', '2')] }, { id: 'b', items: [S('s3', '3', true), T('t2', 2), S('s4', '4')] }],
    links: [{ id: 'l1', kind: 'conv', op: 'and', base: null, nodes: ['a', 'b'] }], jumps: [] };
    expect(checkGraph(g)).toBeNull();
    g.links[0]!.op = 'or';
    expect(checkGraph(g)).toBe('chk_conv_or_end');
  });
});

suite('réceptivités', () => {
  it.each(['a . b', 'a + /b', '↑capteur', 'X3 . t1/X2/3s', '(a + b) . c', 'cpt >= 3', '1', '[dcc1=1]', '[dcc1=1]+[dcc1=4]', '([a>=3] + b) . /[c=0]'])('accepte %s', (s) => {
    expect(parseRecept(s).ok).toBe(true);
  });
  it.each([['', 'p_empty'], ['a .', 'p_operand'], ['(a', 'p_paren'], ['[a=1', 'p_bracket'], ['[]', 'p_char'], ['a b', 'p_char'], ['#', 'p_char']])('refuse %j', (s, key) => {
    const r = parseRecept(s);
    expect(r.ok).toBe(false);
    expect(r.error?.key).toBe(key);
  });
  it('les variables d\'une comparaison entre crochets sont extraites', () => {
    expect([...parseRecept('[dcc1=1]+[n>=m]').vars].sort()).toEqual(['dcc1', 'm', 'n']);
  });
  it('extrait variables et références', () => {
    const r = parseRecept('a . X3 + t1/X5/2s');
    expect([...r.vars]).toEqual(['a']);
    expect(r.refs).toEqual(['3', '5']);
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
    expect(provablyExclusive('(a)', '/a')).toBe(false);
  });
  const build = (recA: string, recB: string): Grafcet => ({
    id: 'g', name: 'g', nextStep: 3, nextTrans: 4,
    seqs: [
      { id: 'q0', items: [{ ...(S('s0', '0', true) as Extract<Node, { kind: 'step' }>), actions: [{ kind: 'continue', label: 'Ouvrir vanne', cond: '' }] }] },
      { id: 'q1', items: [T('t1', 1, recA), S('s1', '1')] },
      { id: 'q2', items: [T('t2', 2, recB), S('s2', '2')] },
    ],
    links: [{ id: 'l', kind: 'div', op: 'or', base: 'q0', nodes: ['q1', 'q2'] }],
    jumps: [{ id: 'j', from: 'q1', to: 't1' }],
  });
  it('grafcet : signale une divergence OU non exclusive, pas les contrôles propres à l’automate', () => {
    const k = (rec: string) => keys(build('a', rec), { profile: 'grafcet' });
    expect(k('b')).toContain('v_or_exclusive');
    expect(k('/a')).not.toContain('v_or_exclusive');
    expect(k('/a')).not.toContain('v_sfc_edge');
  });
  it('sfc : signale renvoi vers une transition, identifiant invalide ; plcopen ajoute les actions conditionnelles', () => {
    const k = keys(build('a', 'b'), { profile: 'sfc' });
    expect(k).toEqual(expect.arrayContaining(['v_sfc_jump_trans', 'v_sfc_ident']));
    expect(k).not.toContain('v_or_exclusive');
    const g = build('a', 'b');
    (g.seqs[0]!.items[0] as { actions: { kind: string }[] }).actions[0]!.kind = 'conditional';
    expect(keys(g, { profile: 'sfc' })).not.toContain('v_plc_cond_action');
    expect(keys(g, { profile: 'plcopen' })).toContain('v_plc_cond_action');
  });
});

suite('références, synchronisations', () => {
  it('trouve les transitions et actions conditionnelles qui citent une étape', () => {
    const P = demoProject();
    const g = P.grafcets[0]!;
    const known = new Set<string>();
    for (const gg of P.grafcets) for (const n of nodesOf(gg)) if (n.kind === 'step') known.add(n.num);
    const trans = nodesOf(g).find((i) => i.kind === 'trans')!;
    if (trans.kind !== 'trans') throw new Error();
    trans.recept = 'a.X3+/b';
    expect(referencesTo(g, '3', known)).toContain(trans.id);
    expect(referencesTo(g, '4', known)).not.toContain(trans.id);
    trans.recept = 'a';
    trans.actions = [{ kind: 'event', label: 'B:=0', cond: 'X99' }];
    expect(referencesTo(g, '99', new Set(['99']))).toContain(trans.id);
  });
  it('liste les étapes testées dans un autre GRAFCET, pas celles du même', () => {
    const P = demoProject();
    const a = P.grafcets[0]!, b = P.grafcets[1]!;
    const stepB = nodesOf(b).find((i) => i.kind === 'step')! as { num: string };
    stepB.num = 'SYNC';
    const tA = nodesOf(a).find((i) => i.kind === 'trans')! as { recept: string };
    tA.recept = 'X' + stepB.num;
    const known = new Set<string>();
    for (const g of P.grafcets) for (const it of nodesOf(g)) if (it.kind === 'step') known.add(it.num);
    expect(syncLinks(P, known).some((l) => l.from === a.id && l.num === stepB.num && l.in.includes(b.id))).toBe(true);
  });
});

suite('macro-étapes', () => {
  const mk = () => { const P = demoProject(); const g = P.grafcets[0]!; const step = nodesOf(g).find((i) => i.kind === 'step' && !i.initial)!; return { P, g, step }; };
  it('une macro sans expansion est une erreur ; l’expansion créée est valide', () => {
    const { P, g, step } = mk();
    expect(setMacro(g, step.id, true)).toBe(true);
    expect(keys(g, { project: P })).toContain('v_macro_no_expansion');
    const x = createExpansion(P, g, step.id, 'Expansion')!;
    expect(nodesOf(x).map((i) => i.kind)).toEqual(['step', 'trans', 'step']);
    expect(keys(g, { project: P })).not.toContain('v_macro_no_expansion');
    const k = keys(x, { project: P });
    for (const bad of ['v_noinit', 'v_dead_end', 'v_unreachable', 'v_expansion_entry']) expect(k).not.toContain(bad);
  });
  it('détecte une expansion sans sortie et une macro qui se contient elle-même', () => {
    const { P, g, step } = mk();
    setMacro(g, step.id, true);
    const x = createExpansion(P, g, step.id, 'Expansion')!;
    const out = x.seqs[0]!.items[2] as { role?: string; expansion?: string | null };
    out.role = undefined;
    expect(keys(x, { project: P })).toContain('v_expansion_exit');
    out.role = 'exit';
    out.expansion = g.id;
    expect(keys(g, { project: P })).toContain('v_macro_cycle');
  });
});

suite('actions sur événement', () => {
  const mk = (kind: 'event' | 'continue', cond: string, label: string) => {
    const g = demoProject().grafcets[0]!;
    (nodesOf(g).find((i) => i.kind === 'step')! as { actions: unknown[] }).actions = [{ kind, label, cond }];
    return g;
  };
  it('avertit si l’événement n’a pas de front', () => { expect(keys(mk('event', 'a', 'B:=1'))).toContain('v_event_no_edge'); });
  it('accepte un front et signale une affectation continue', () => {
    expect(keys(mk('event', '↑a', 'B:=1'))).not.toContain('v_event_no_edge');
    expect(keys(mk('continue', '', 'B:=1'))).toContain('v_assign_continuous');
  });
});

suite('migration de l’ancien format (arbre)', () => {
  const tree = (): TreeGrafcet => ({
    id: 'g1', name: 'ancien', nextStep: 9, nextTrans: 9,
    items: [S('s0', '0', true), T('t1', 1), S('s1', '1'),
      { id: 'o', kind: 'or', branches: [[T('t2', 2), S('s2', '2'), T('t3', 3)], [T('t4', 4), S('s3', '3'), T('t5', 5)]] },
      S('s4', '4'), T('t6', 6),
      { id: 'a', kind: 'and', branches: [[S('s5', '5'), T('t7', 7), S('s6', '6')], [S('s7', '7')]] },
      T('t8', 8), { id: 'j', kind: 'jump', target: 's0' }],
  });
  it('convertit divergences, convergences et renvoi', () => {
    const g = treeToGraph(tree(), { counter: 1 });
    expect(checkGraph(g)).toBeNull();
    expect(g.links.map((l) => `${l.kind}-${l.op}`)).toEqual(['div-or', 'conv-or', 'div-and', 'conv-and']);
    expect(g.jumps).toHaveLength(1);
    expect(nodesOf(g)).toHaveLength(16);
    expect(keys(g).filter((k) => k === 'v_structure')).toEqual([]);
  });
  it('migre un projet et laisse intact un GRAFCET déjà converti', () => {
    const P = demoProject();
    const m = migrateProject({ ...P, grafcets: [tree(), P.grafcets[1]!] });
    expect(m.grafcets[1]).toBe(P.grafcets[1]);
    expect(m.grafcets[0]!.seqs.length).toBeGreaterThan(1);
  });
});

suite('opérations : le GRAFCET reste cohérent', () => {
  const ops = ['ins-step-after', 'ins-trans-after', 'ins-step-before', 'ins-trans-before', 'div-or', 'div-and', 'conv-or', 'conv-and', 'remove', 'branch', 'unbranch', 'jump', 'unjump', 'link-off'] as const;
  it('propriété : toute suite d’opérations garde le modèle valide', () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.constantFrom(...ops), fc.nat(60)), { maxLength: 40 }), (steps) => {
      const P = proj();
      const g = newGrafcet(P, 'p');
      for (const [op, k] of steps) {
        const ix = indexOf(g);
        const pool = [...ix.node.keys(), ...ix.link.keys(), ...ix.jump.keys(), ...[...ix.seq.values()].filter((s) => !s.items.length).map((s) => s.id)];
        const id = pool[k % pool.length]!;
        if (op.startsWith('ins')) insertNode(P, g, id, op.includes('step') ? 'step' : 'trans', op.endsWith('before') ? 'before' : 'after');
        else if (op === 'div-or' || op === 'div-and') addDivergence(P, g, id, op === 'div-or' ? 'or' : 'and');
        else if (op === 'conv-or' || op === 'conv-and') addConvergence(P, g, id, op === 'conv-or' ? 'or' : 'and');
        else if (op === 'remove') removeNode(g, id);
        else if (op === 'branch') addBranch(P, g, id, 1);
        else if (op === 'unbranch') removeBranch(g, id);
        else if (op === 'jump') addJump(P, g, id);
        else if (op === 'unjump') removeJump(g, id);
        else removeLink(g, id);
        expect(checkGraph(g)).toBeNull();
      }
      return true;
    }), { numRuns: 120 });
  });
  it('capacités : une étape libre peut diverger en OU, pas en ET', () => {
    const P = proj(); const g = newGrafcet(P, 'p');
    const c = capabilities(g, g.seqs[0]!.items[0]!.id);
    expect(c.div.or).toBe(true);
    expect(c.insert.trans.after).toBe(true);
    expect(c.removeLink).toBe(false);
  });
});
suite('négation', () => {
  it('s’applique à l’opérande qui suit, un groupe doit être entre parenthèses', () => {
    expect(parseRecept('/(a+b).c').ok).toBe(true);
    expect(parseRecept('/(a+b').ok).toBe(false);
    expect(parseRecept('/a+b').refs).toEqual([]);
  });
});


suite('renvoi depuis une branche vide de divergence ET', () => {
  // q1 : étape 1, transition 1, divergence ET vers q2 (vide) et q3 (étape 2) ; q4 : étape 0 cible du renvoi
  const build = (op: 'and' | 'or' = 'and'): Grafcet => ({
    id: 'g', name: 'g', nextStep: 9, nextTrans: 9,
    seqs: [
      { id: 'q1', items: op === 'and' ? [S('s1', '1', true), T('t1', 1)] : [S('s1', '1', true)] },
      { id: 'q2', items: [] },
      { id: 'q3', items: op === 'and' ? [S('s2', '2')] : [T('t2', 2), S('s2', '2')] },
      { id: 'q4', items: [S('s0', '0')] },
    ],
    links: [{ id: 'l1', kind: 'div', op, base: 'q1', nodes: ['q2', 'q3'] }],
    jumps: [{ id: 'j1', from: 'q2', to: 's0' }],
  });
  it('est valide quand la séquence vide est branche d\'une divergence ET', () => {
    expect(checkGraph(build('and'))).toBeNull();
  });
  it('reste refusé hors divergence ET', () => {
    expect(checkGraph(build('or'))).toBe('chk_jump_from');
    const g = build('and');
    g.links = [];
    expect(checkGraph(g)).toBe('chk_jump_from');
  });
  it('refuse une cible de même nature que la barre (une transition)', () => {
    const g = build('and');
    g.seqs[3]!.items = [T('t0', 7), S('s0', '0')];
    g.jumps[0]!.to = 't0';
    expect(checkGraph(g)).toBe('chk_jump_kind');
  });
  it('tidy conserve ce renvoi', () => {
    const g = build('and');
    tidy(g);
    expect(g.jumps).toHaveLength(1);
    expect(g.seqs.map((q) => q.id)).toContain('q2');
  });
  it('flatten relie la transition avant la barre à l\'étape cible', () => {
    expect(flatten(build('and')).links).toContainEqual({ from: 't1', to: 's0', jump: true });
  });
});
