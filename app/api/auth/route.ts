import { NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_USER, SESSION_COOKIE, encodeSession } from "@/lib/auth";

export const runtime = "nodejs";

const Credentials = z.object({
  email: z.string().email("That doesn't look like an email address."),
  // Length is checked so the form has something honest to validate against.
  // Nothing is verified — see the note at the top of lib/auth.ts.
  password: z.string().min(8, "Password must be at least 8 characters."),
  name: z.string().optional(),
});

function setSession(user: { name: string; email: string }) {
  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, encodeSession(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  // The demo door. A prototype nobody can get into is a prototype nobody looks at.
  if (body?.demo === true) return setSession(DEMO_USER);

  const parsed = Credentials.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check those details." },
      { status: 400 }
    );
  }

  const { email, password: _password, name } = parsed.data;
  const derived = name?.trim() || email.split("@")[0].replace(/[._-]+/g, " ");
  const user = { name: derived, email };

  // The profile is created and kept in step by store.ensureUser() on the first
  // scoped request — this route's job ends at issuing the cookie.
  return setSession(user);
}

/** Sign out. Clearing the cookie is the whole of it. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
