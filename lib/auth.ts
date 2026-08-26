/* ---------------------------------------------------------------------------
 * THIS IS NOT AUTHENTICATION.
 *
 * It is a signed-in *state* — enough to design and demonstrate the shell of an
 * account (avatar menu, login screen, protected routes) without pretending to
 * have solved identity. There is no password check, no hashing, no token, no
 * expiry, no CSRF protection. The cookie says who you claim to be and the app
 * believes it.
 *
 * That is a deliberate scope line, not an oversight. Real auth means picking a
 * provider, owning a user table, and handling reset flows and sessions — none
 * of which teaches anything about adaptive programming, which is what this
 * prototype is for. When it is time, this file is the seam: replace these three
 * functions with Auth.js or Clerk and nothing above them changes.
 * ------------------------------------------------------------------------- */

export const SESSION_COOKIE = "sw-session";

export interface SessionUser {
  name: string;
  email: string;
}

export const DEMO_USER: SessionUser = {
  name: "Demo Lifter",
  email: "demo@secondweek.app",
};

export function encodeSession(user: SessionUser): string {
  return Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
}

export function decodeSession(raw: string | undefined): SessionUser | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed?.email !== "string" || typeof parsed?.name !== "string") return null;
    return { name: parsed.name, email: parsed.email };
  } catch {
    return null;
  }
}

/** "Demo Lifter" → "DL". Two letters is the most an avatar can carry. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
