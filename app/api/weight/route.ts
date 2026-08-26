import { NextResponse } from "next/server";
import { getScope } from "@/lib/session";
import { store } from "@/lib/store";
import { WeightEntry } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = WeightEntry.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "That weight didn't validate." },
      { status: 400 }
    );
  }
  await store.saveWeight(scope.userId, parsed.data);
  return NextResponse.json({ ok: true });
}
