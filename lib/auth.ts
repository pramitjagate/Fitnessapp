/* ---------------------------------------------------------------------------
 * Identity — the pure half.
 *
 * Everything here is safe in a client bundle: no cookies, no request, no
 * password handling. The account menu imports initials() from this file, and
 * dragging node:crypto's scrypt into the browser to get two letters would be
 * absurd. Hashing and token generation live in lib/password.ts; reading the
 * cookie and validating the session lives in lib/session.ts.
 *
 * This file used to open with a note explaining that it was NOT authentication.
 * It is now: passwords are scrypt-hashed with a per-user salt, sessions are
 * random tokens stored as hashes with an expiry, and a cookie is no longer
 * taken at its word.
 * ------------------------------------------------------------------------- */

import { createHash } from "node:crypto";

export const SESSION_COOKIE = "sw-session";

/**
 * A stable id derived from the email.
 *
 * It lives here rather than in lib/session.ts because it is pure: no cookies,
 * no request. A script that needs to address a user's data shouldn't have to
 * import `next/headers` to do it.
 *
 * Derived from the email rather than generated, which is what let the account
 * data written before real sign-up survive it: the same person signing up with
 * the same address lands on the rows they already had.
 */
export function userIdFor(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);
}

export interface SessionUser {
  name: string;
  email: string;
}

/** "Demo Lifter" → "DL". Two letters is the most an avatar can carry. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
