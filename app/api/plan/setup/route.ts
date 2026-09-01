import { NextResponse } from "next/server";
import { z } from "zod";
import { mondayOf } from "@/lib/dates";
import { SPLITS, WEEKDAYS, buildStarterPlan, intentFrom } from "@/lib/programme";
import { getScope } from "@/lib/session";
import { store } from "@/lib/store";

export const runtime = "nodejs";

const Body = z.object({
  splitKey: z.enum(SPLITS.map((s) => s.key) as [string, ...string[]]),
  trainingDays: z.array(z.enum(WEEKDAYS)).min(1, "Pick at least one training day.").max(7),
  goal: z.string().trim().max(200),
  inDeficit: z.boolean(),
  /** Start this week or next. Defaults to this week — people set this up to use it now. */
  startNextWeek: z.boolean().default(false),
});

export async function POST(request: Request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check those answers." },
      { status: 400 }
    );
  }

  const { splitKey, trainingDays, goal, inDeficit, startNextWeek } = parsed.data;
  const db = await store.read(scope.userId);

  const monday = mondayOf(new Date());
  const weekStart = startNextWeek ? new Date(monday.getTime() + 7 * 86400_000) : monday;

  const intent = intentFrom(
    db.intent,
    splitKey as Parameters<typeof intentFrom>[1],
    trainingDays,
    goal,
    inDeficit
  );
  await store.saveIntent(scope.userId, intent);

  const plan = buildStarterPlan(
    splitKey as Parameters<typeof buildStarterPlan>[0],
    trainingDays,
    weekStart
  );
  /*
   * Saved as "rules" with no decisions, because that is what it is: a shape the
   * person described, not something the engine concluded. Recording it as a
   * decision would put a sentence in the coach's mouth it never said.
   */
  await store.savePlan(scope.userId, plan, [], "rules");

  return NextResponse.json({ ok: true, weekStart: plan.weekStart, sessions: plan.sessions.length });
}
