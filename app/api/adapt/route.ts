import { NextResponse } from "next/server";
import { adapt } from "@/lib/adapt";
import { getScope } from "@/lib/session";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { userId } = scope;

  if (url.searchParams.get("reset") === "1") {
    await store.reset(userId);
    return NextResponse.json({ ok: true, reset: true });
  }

  try {
    const db = await store.read(userId);
    const result = await adapt(db);
    await store.savePlan(userId, result.plan, result.decisions, result.source);
    return NextResponse.json({
      ok: true,
      source: result.source,
      note: "note" in result ? result.note : undefined,
      weekStart: result.plan.weekStart,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Adaptation failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
