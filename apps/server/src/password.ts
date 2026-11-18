import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

/** Coût de scrypt (N = 2^15, r = 8, p = 1 : recommandation OWASP). Réductible dans les tests seulement. */
export interface ScryptCost { N: number; r: number; p: number }
export const DEFAULT_COST: ScryptCost = { N: 32768, r: 8, p: 1 };

const derive = (pw: string, salt: Buffer, c: ScryptCost): Promise<Buffer> =>
  new Promise((res, rej) => scrypt(pw.normalize('NFKC'), salt, 32, { N: c.N, r: c.r, p: c.p, maxmem: 128 * c.N * c.r * 2 }, (e, k) => (e ? rej(e) : res(k))));

/** Format : scrypt$N$r$p$sel$empreinte (base64url). */
export async function hashPassword(pw: string, cost: ScryptCost = DEFAULT_COST): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(pw, salt, cost);
  return ['scrypt', cost.N, cost.r, cost.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, salt, key] = stored.split('$');
  if (alg !== 'scrypt' || !N || !r || !p || !salt || !key) return false;
  const want = Buffer.from(key, 'base64url');
  const got = await derive(pw, Buffer.from(salt, 'base64url'), { N: +N, r: +r, p: +p });
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Règle de mot de passe : longueur seulement (pas de règles de composition, qui nuisent), et pas l'email lui-même. */
export function passwordProblem(pw: string, email = ''): 'too_short' | 'too_long' | 'is_email' | null {
  if (pw.length < PASSWORD_MIN) return 'too_short';
  if (pw.length > PASSWORD_MAX) return 'too_long';
  if (email && pw.toLowerCase() === email.toLowerCase()) return 'is_email';
  return null;
}
