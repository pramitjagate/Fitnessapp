import { NextResponse } from "next/server";
import { getScope } from "@/lib/session";
import { store } from "@/lib/store";
import { Profile } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json(await store.readProfile(scope.userId));
}

export async function POST(request: Request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = Profile.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Those details didn't validate." },
      { status: 400 }
    );
  }
  return NextResponse.json(await store.saveProfile(scope.userId, parsed.data));
}
