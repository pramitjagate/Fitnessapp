import { NextResponse } from "next/server";
import { getScope } from "@/lib/session";
import { store } from "@/lib/store";
import { FoodEntry } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  // The id and date are the server's business, not the client's.
  const parsed = FoodEntry.omit({ id: true }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "That entry didn't validate." },
      { status: 400 }
    );
  }
  const entry: FoodEntry = {
    ...parsed.data,
    // Random suffix rather than a count: two quick taps produced the same id
    // when it was derived from the list length.
    id: `food-${parsed.data.date}-${Math.random().toString(36).slice(2, 9)}`,
  };
  await store.addFood(scope.userId, entry);
  return NextResponse.json({ entry });
}

export async function DELETE(request: Request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "No id given." }, { status: 400 });
  await store.removeFood(scope.userId, id);
  return NextResponse.json({ ok: true });
}
