import { NextResponse } from "next/server";
import { getScope } from "@/lib/session";
import { store } from "@/lib/store";

export const runtime = "nodejs";

export async function POST() {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  await store.deleteSpotifyConnection(scope.userId);
  return NextResponse.json({ ok: true });
}
