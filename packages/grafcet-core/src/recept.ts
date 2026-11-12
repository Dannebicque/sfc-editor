import type { Message } from './types';

export interface ReceptResult {
  ok: boolean;
  /** Identifiants d'étapes référencés (Xn, temporisations). */
  refs: string[];
  /** Variables utilisées. */
  vars: Set<string>;
  error?: Message;
}

class ParseFail {
  constructor(public message: Message) {}
}

/**
 * Analyse syntaxique d'une réceptivité : ET « . », OU « + », NON « / », fronts ↑ ↓,
 * Xn, temporisations (t1/X2/3s), comparaisons. Ne produit que des clés de message.
 * `known` : identifiants d'étapes du projet. Un mot qui est (ou dont le suffixe après « X » est) un identifiant connu
 * désigne cette étape ; sans `known`, seuls les mots « Xn » (n entier) sont des références.
 * (Prototype : un vrai AST versionné viendra avec l'ADR sur la grammaire des réceptivités.)
 */
export function parseRecept(src: string, known?: ReadonlySet<string>): ReceptResult {
  const s = src;
  let i = 0;
  const refs: string[] = [];
  const vars = new Set<string>();
  const fail = (key: string, params?: Record<string, string | number>): never => {
    throw new ParseFail({ key, params, pos: i });
  };
  /** Identifiant de l'étape désignée par un mot, ou null si c'est une variable. */
  const stepRef = (w: string): string | null => {
    if (known?.has(w)) return w;
    if (/^X./.test(w) && known?.has(w.slice(1))) return w.slice(1);
    return /^X\d+$/.test(w) ? w.slice(1) : null;
  };
  const ws = () => { while (i < s.length && /\s/.test(s[i]!)) i++; };
  const peek = () => { ws(); return s[i]; };
  function expr() { term(); while (peek() === '+') { i++; term(); } }
  function term() { factor(); while (['.', '·', '*', '&'].includes(peek() ?? '')) { i++; factor(); } }
  function factor(): void {
    ws();
    const c = s[i];
    if (c === '/' || c === '!' || c === '¬' || c === '↑' || c === '↓' || c === '^') { i++; return factor(); }
    atom();
  }
  function atom() {
    ws();
    if (i >= s.length) fail('p_operand');
    const rest = s.slice(i);
    let m: RegExpMatchArray | null;
    if (rest[0] === '[') { i++; expr(); ws(); if (s[i] !== ']') fail('p_bracket'); i++; return; }
    if (rest[0] === '(') { i++; expr(); ws(); if (s[i] !== ')') fail('p_paren'); i++; return; }
    if ((m = rest.match(/^(?:t\d*\/X\w+\/\d+(?:[.,]\d+)?\s?(?:ms|s|min)|\d+(?:[.,]\d+)?\s?(?:ms|s|min)\/X\w+)(?![\w])/i))) {
      i += m[0].length;
      const w = m[0].match(/\/?(X\w+)/i)![1]!;
      refs.push(known?.has(w) ? w : w.slice(1));
      return;
    }
    if ((m = rest.match(/^[01](?![\w])/))) { i += 1; return; }
    if ((m = rest.match(/^[A-Za-zÀ-ÿ_][A-Za-z0-9À-ÿ_]*/))) {
      i += m[0].length;
      const r = stepRef(m[0]); if (r != null) refs.push(r); else vars.add(m[0]);
      const c = s.slice(i).match(/^\s*(<=|>=|==|!=|=|<|>)\s*(-?\d+(?:[.,]\d+)?|[A-Za-zÀ-ÿ_][A-Za-z0-9À-ÿ_]*)/);
      if (c) { i += c[0].length; if (/^[A-Za-z_]/.test(c[2]!)) vars.add(c[2]!); }
      return;
    }
    fail('p_char', { c: rest[0]! });
  }
  try {
    if (!s.trim()) return { ok: false, error: { key: 'p_empty' }, refs, vars };
    expr(); ws();
    if (i < s.length) fail('p_char', { c: s[i]! });
    return { ok: true, refs, vars };
  } catch (e) {
    if (e instanceof ParseFail) return { ok: false, error: e.message, refs, vars };
    throw e;
  }
}
