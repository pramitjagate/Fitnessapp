import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionUser } from "./auth";
import { store } from "./store";

/**
 * Cookie access is split out from lib/auth.ts on purpose: `next/headers` is
 * server-only, and the client components (the avatar, the profile form) need
 * the pure helpers next door. Importing one module for `initials()` used to
 * drag `cookies()` into the browser bundle and fail the build.
 */
export async function getUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return decodeSession(jar.get(SESSION_COOKIE)?.value);
}

/**
 * A stable id derived from the email.
 *
 * Deterministic on purpose while auth is a shell: the same email lands on the
 * same data across sign-ins without a users table to look it up in. When
 * Auth.js arrives this becomes the provider's user id and nothing else changes,
 * because every call site already treats it as an opaque string.
 */
export function userIdFor(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);
}

export interface Scope {
  userId: string;
  user: SessionUser;
}

/**
 * The scope every page and route works in. Returns null when signed out —
 * proxy.ts will already have redirected, so this is the belt to its braces,
 * and it means no data access can be written without a user in hand.
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
