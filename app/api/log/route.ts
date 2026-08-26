import { NextResponse } from "next/server";
import { z } from "zod";
import { getScope } from "@/lib/session";
import { store } from "@/lib/store";
import { LoggedLift, Sleep } from "@/lib/types";

export const runtime = "nodejs";

const Body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  focus: z.string(),
  status: z.enum(["completed", "skipped"]),
  accessoriesCompleted: z.boolean(),
  feedback: z.string(),
  sleep: Sleep.nullable(),
  lifts: z.array(LoggedLift),
});

export async function POST(request: Request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body was not valid JSON." }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Could not save: ${parsed.error.issues[0]?.message ?? "invalid data"}` },
      { status: 400 }
    );
  }

  const d = parsed.data;
  await store.saveSession(scope.userId, {
    id: `${d.date}-${Date.now()}`,
    date: d.date,
    focus: d.focus,
    status: d.status,
    lifts: d.lifts,
    accessoriesCompleted: d.accessoriesCompleted,
    feedback: d.feedback,
    sleep: d.sleep,
    sleepSource: d.sleep ? "self_report" : null,
    soreness: [],
    loggedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
