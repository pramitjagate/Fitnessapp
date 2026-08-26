import { NextResponse } from "next/server";
import { getScope } from "@/lib/session";
import { store } from "@/lib/store";
import { MusicPrefs } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json(await store.readMusicPrefs(scope.userId));
}

export async function POST(request: Request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = MusicPrefs.safeParse(body);
  if (!parsed.success) {
    // Validate on the way in rather than trusting the form. The playlist
    // prompt is built from these strings, so a bad shape here shows up much
    // later and much more confusingly.
    return NextResponse.json(
      { error: "Those preferences didn't validate.", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  return NextResponse.json(await store.saveMusicPrefs(scope.userId, parsed.data));
}
