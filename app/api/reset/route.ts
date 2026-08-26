import { NextResponse } from "next/server";
import { getScope } from "@/lib/session";
import { store } from "@/lib/store";

export const runtime = "nodejs";

/** Throws away every logged session and returns to the seeded eight weeks. */
export async function POST() {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await store.reset(scope.userId);
  return NextResponse.json({ ok: true });
}
