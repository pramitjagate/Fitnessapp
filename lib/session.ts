import { cookies } from "next/headers";
import { SESSION_COOKIE, userIdFor, type SessionUser } from "./auth";
import { hashToken } from "./password";
import { store } from "./store";

// Re-exported so existing imports keep working; it is defined in ./auth.
export { userIdFor };

/**
 * Cookie access is split out from lib/auth.ts on purpose: `next/headers` is
 * server-only, and the client components (the avatar, the profile form) need
 * the pure helpers next door. Importing one module for `initials()` used to
 * drag `cookies()` into the browser bundle and fail the build.
 *
 * The cookie holds a random token and nothing else. Everything about who you
 * are comes from looking that token up — the cookie used to carry a base64
 * name and email, which meant anyone who could edit a cookie could be anyone.
 */
export async function getUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await store.readAuthSession(hashToken(token));
  if (!row) return null;
  return { name: row.name, email: row.email };
}

export interface Scope {
  userId: string;
  user: SessionUser;
}

/**
 * The scope every page and route works in. Returns null when signed out —
 * proxy.ts will already have redirected, so this is the belt to its braces,
 * and it means no data access can be written without a user in hand.
 *
 * proxy.ts can only see that a cookie *exists*; it runs on the edge and cannot
 * reach the database. This is where the token is actually checked, which is
 * why every route calls it rather than trusting the redirect.
 */
export async function getScope(): Promise<Scope | null> {
  const user = await getUser();
  if (!user) return null;
  const userId = userIdFor(user.email);
  await store.ensureUser({ id: userId, email: user.email, name: user.name });
  return { userId, user };
}

/** For pages, where a missing session is a bug rather than a case to handle. */
export async function requireScope(): Promise<Scope> {
  const scope = await getScope();
  if (!scope) throw new Error("No session — proxy.ts should have redirected.");
  return scope;
}
