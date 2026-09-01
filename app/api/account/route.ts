import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { getScope } from "@/lib/session";
import { store } from "@/lib/store";

export const runtime = "nodejs";

const Body = z.object({ password: z.string().min(1, "Enter your password to confirm.") });

/**
 * Deletes the signed-in account, not just its data — see Store.deleteAccount.
 * The password is re-checked here rather than trusted from the session cookie
 * alone: a cookie only proves a browser is still signed in, and this is the
 * one action on the site with no undo once it returns.
 */
export async function DELETE(request: Request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter your password." },
      { status: 400 }
    );
  }

  const account = await store.findAccount(scope.user.email);
  const ok = await verifyPassword(parsed.data.password, account?.passwordHash ?? null);
  if (!ok) {
    return NextResponse.json({ error: "That password doesn't match." }, { status: 401 });
  }

  await store.deleteAccount(scope.userId);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
