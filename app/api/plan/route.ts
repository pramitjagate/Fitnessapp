import { NextResponse } from "next/server";
import { z } from "zod";
import { mondayOf } from "@/lib/dates";
import { PlanDraft, draftToPlan } from "@/lib/plan-import";
import { getScope } from "@/lib/session";
import { store } from "@/lib/store";

export const runtime = "nodejs";

const Body = z.object({
  draft: PlanDraft,
  /** Which week it starts. Defaults to next Monday rather than overwriting now. */
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Whether to overwrite the programme description on the profile too. */
  updateIntent: z.boolean().default(true),
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
      { error: `Could not save: ${parsed.error.issues[0]?.message ?? "invalid plan"}` },
      { status: 400 }
    );
  }

  const { draft, weekStart, updateIntent } = parsed.data;
  if (!draft.days.length) {
    return NextResponse.json({ error: "A plan needs at least one training day." }, { status: 400 });
  }

  const start = weekStart ? new Date(`${weekStart}T12:00:00`) : mondayOf(new Date());
  const plan = draftToPlan(draft, start);

  /*
   * Saved as a "rules" plan with an empty decision list, because that is what
   * it is: nothing was adapted, a person typed it. Recording it as a model
   * decision would put words in the engine's mouth on the Upcoming page.
   */
  await store.savePlan(scope.userId, plan, [], "rules");

  if (updateIntent) {
    const db = await store.read(scope.userId);
    await store.saveIntent(scope.userId, {
      ...db.intent,
      daysPerWeek: draft.days.length,
      split: draft.name || db.intent.split,
      goal: draft.goal || db.intent.goal,
      progressionRule: draft.progressionRule || db.intent.progressionRule,
      notes: draft.notes || db.intent.notes,
    });
  }

  return NextResponse.json({ ok: true, weekStart: plan.weekStart, sessions: plan.sessions.length });
}
