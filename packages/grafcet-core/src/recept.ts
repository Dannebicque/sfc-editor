import type { Message } from './types';

export interface ReceptResult {
  ok: boolean;
  /** Numéros d'étapes référencés (Xn, temporisations). */
  refs: number[];
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
 * (Prototype : un vrai AST versionné viendra avec l'ADR sur la grammaire des réceptivités.)
 */
export function parseRecept(src: string): ReceptResult {
  const s = src;
  let i = 0;
  const refs: number[] = [];
  const vars = new Set<string>();
  const fail = (key: string, params?: Record<string, string | number>): never => {
    throw new ParseFail({ key, params, pos: i });
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
    if (rest[0] === '(') { i++; expr(); ws(); if (s[i] !== ')') fail('p_paren'); i++; return; }
    if ((m = rest.match(/^(?:t\d*\/X\d+\/\d+(?:[.,]\d+)?\s?(?:ms|s|min)|\d+(?:[.,]\d+)?\s?(?:ms|s|min)\/X\d+)(?![\w])/i))) {
      i += m[0].length;
      refs.push(+m[0].match(/X(\d+)/i)![1]!);
      return;
    }
    if ((m = rest.match(/^[01](?![\w])/))) { i += 1; return; }
    if ((m = rest.match(/^[A-Za-zÀ-ÿ_][A-Za-z0-9À-ÿ_]*/))) {
      i += m[0].length;
      if (/^X\d+$/.test(m[0])) refs.push(+m[0].slice(1)); else vars.add(m[0]);
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
