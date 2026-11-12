import { describe, expect, it } from 'vitest';
import { parseForcingOrder } from '../src';

describe('ordres de forçage dans les actions', () => {
  it.each([
    ['G2{INIT}', { target: 'G2', what: { kind: 'init' } }],
    ['G2 { init }', { target: 'G2', what: { kind: 'init' } }],
    ['G2{}', { target: 'G2', what: { kind: 'empty' } }],
    ['G2{*}', { target: 'G2', what: { kind: 'freeze' } }],
    ['G2{X1,X3}', { target: 'G2', what: { kind: 'steps', steps: ['X1', 'X3'] } }],
    ['Mon GRAFCET{5; 6}', { target: 'Mon GRAFCET', what: { kind: 'steps', steps: ['5', '6'] } }],
  ])('comprend %j', (s, exp) => { expect(parseForcingOrder(s)).toEqual(exp); });
  it.each(['', 'a:=1', 'G2', '{INIT}', 'G2{a b}', 'G2{INIT', 'G2{{}}'])('ignore %j', (s) => { expect(parseForcingOrder(s)).toBeNull(); });
});
