import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/* ---------------------------------------------------------------------------
 * Passwords and session tokens. Server only — never import this from a client
 * component.
 *
 * Two different jobs that are easy to confuse:
 *
 *   A PASSWORD is hashed SLOWLY and with a per-user salt. Slow is the point:
 *   an attacker with the database has to pay the cost once per guess per user,
 *   and the salt means one rainbow table can't cover everybody.
 *
 *   A SESSION TOKEN is hashed FAST and unsalted. It is already 32 bytes of
 *   randomness, so there is nothing to guess and nothing to precompute — the
 *   hash exists only so a stolen database dump doesn't hand over live sessions.
 *
 * scrypt is used rather than argon2 or bcrypt because it is in Node's standard
 * library. No native build step, nothing to install, nothing to keep patched.
 * argon2id is the better primitive and this is the seam to swap it at — the
 * stored format is self-describing for exactly that reason.
 * ------------------------------------------------------------------------- */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

/**
 * N=16384 is Node's default and lands around 50-100ms on a small server. High
 * enough to make offline guessing expensive, low enough that a sign-in on a
 * cold serverless function doesn't time out.
 */
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/** Stored as `scrypt$<salt-base64>$<hash-base64>` — self-describing so a future algorithm can live beside this one. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

/**
 * Constant-time comparison, always. Comparing hashes with `===` leaks how many
 * leading bytes matched through timing, which over enough requests is enough to
 * reconstruct one.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;

  const expected = Buffer.from(hashB64, "base64");
  let derived: Buffer;
  try {
    derived = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length);
  } catch {
    return false;
  }

  // timingSafeEqual throws on a length mismatch, which would itself be a signal.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/**
 * 32 bytes from the OS CSPRNG. This is the whole secret — it goes to the
 * browser in an httpOnly cookie and never touches the database in this form.
 */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores. A dump of this table cannot be replayed as sessions. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Thirty days. Long enough that a training app doesn't log you out mid-block,
 * short enough that an abandoned session on a shared machine expires.
 */
export const SESSION_TTL_DAYS = 30;

export function sessionExpiry(from = new Date()): Date {
  return new Date(from.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}
