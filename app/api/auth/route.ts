import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, userIdFor } from "@/lib/auth";
import {
  hashPassword,
  hashToken,
  newSessionToken,
  sessionExpiry,
  verifyPassword,
} from "@/lib/password";
import { store } from "@/lib/store";

export const runtime = "nodejs";

/* ---------------------------------------------------------------------------
 * Sign up, sign in, sign out.
 *
 * Three rules run through this file:
 *
 *   1. THE SAME ANSWER FOR A WRONG PASSWORD AND AN UNKNOWN EMAIL. "No account
 *      with that email" is a free membership check for anyone who wants to
 *      know whether a given address uses this app.
 *
 *   2. VERIFY EVEN WHEN THERE IS NOTHING TO VERIFY. An unknown email returns
 *      in microseconds and a real one takes ~80ms of scrypt, which is a
 *      membership check by stopwatch. So the dummy hash below gets verified
 *      anyway, to spend the same time.
 *
 *   3. NO PASSWORD IS EVER LOGGED, ECHOED OR RETURNED. Not in an error, not in
 *      a validation message, not in a response body.
 * ------------------------------------------------------------------------- */

const Credentials = z.object({
  email: z.string().trim().toLowerCase().email("That doesn't look like an email address."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  name: z.string().trim().max(60).optional(),
  mode: z.enum(["signin", "signup"]),
});

/** A real scrypt hash of a value nobody knows, used to burn time on unknown emails. */
const DUMMY_HASH =
  "scrypt$YWJjZGVmZ2hpamtsbW5vcA==$" +
  "S0hEWk1nQmVYcXNQcVZzbGVKM3NEQ1B3aFdVYnpiT0piYUNXcVpnZmxONUFUZDh1SnZzdz09";

const SAME_ANSWER = "That email and password don't match an account.";

/* ---------------------------------------------------------------------------
 * Rate limiting, in memory.
 *
 * Honest about what this is: per-process, lost on redeploy, and on Vercel each
 * serverless instance has its own copy — so someone spreading attempts across
 * instances gets more than five. It still stops the case that actually happens,
 * which is a script hammering one address from one place.
 *
 * The real fix is a shared counter in Postgres or Redis keyed on email and IP.
 * Worth doing the day this has users; not worth pretending it is already done.
 * ------------------------------------------------------------------------- */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; first: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const row = attempts.get(key);
  if (!row || now - row.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
    return false;
  }
  row.count += 1;
  return row.count > MAX_ATTEMPTS;
}

function clearAttempts(key: string) {
  attempts.delete(key);
}

async function issueSession(user: { id: string; email: string; name: string }) {
  const token = newSessionToken();
  const expiresAt = sessionExpiry();
  await store.createAuthSession(hashToken(token), user.id, expiresAt);

  const res = NextResponse.json({ user: { name: user.name, email: user.email } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, // JavaScript on the page cannot read it, so XSS cannot steal it
    sameSite: "lax", // not sent on cross-site POSTs, which is the CSRF guard
    secure: process.env.NODE_ENV === "production", // http://localhost still needs to work
    path: "/",
    expires: expiresAt,
  });
  return res;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = Credentials.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check those details." },
      { status: 400 }
    );
  }

  const { email, password, name, mode } = parsed.data;
  const key = `${mode}:${email}`;
  if (rateLimited(key)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait fifteen minutes and try again." },
      { status: 429 }
    );
  }

  const existing = await store.findAccount(email);

  if (mode === "signup") {
    if (existing?.passwordHash) {
      // Sign-up is the one place the same-answer rule cannot hold: the person
      // has to be told the address is taken or they cannot proceed. The
      // wording points at signing in rather than confirming who is registered.
      return NextResponse.json(
        { error: "That email already has an account. Sign in instead." },
        { status: 409 }
      );
    }

    const id = existing?.id ?? userIdFor(email);
    const displayName = name || email.split("@")[0].replace(/[._-]+/g, " ");
    await store.createAccount({
      id,
      email,
      name: displayName,
      passwordHash: await hashPassword(password),
    });
    clearAttempts(key);
    return issueSession({ id, email, name: displayName });
  }

  // Sign in. Rule 2: the dummy verify runs so an unknown email costs the same
  // time as a known one.
  const ok = await verifyPassword(password, existing?.passwordHash ?? DUMMY_HASH);
  if (!existing?.passwordHash || !ok) {
    return NextResponse.json({ error: SAME_ANSWER }, { status: 401 });
  }

  clearAttempts(key);
  return issueSession(existing);
}

/** Sign out. The session row is deleted, so the token is dead even if it was copied. */
export async function DELETE(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  if (token) await store.deleteAuthSession(hashToken(token));

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
