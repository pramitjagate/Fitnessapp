import { NextResponse } from "next/server";
import { decideNutrition, gatherNutritionEvidence } from "@/lib/nutrition-adapt";
import { getScope } from "@/lib/session";
import { store } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Two-step by design: GET proposes, POST applies. The lifter sees the decision
 * and the evidence it came from *before* the target moves — a coach that
 * changes your calories without telling you why is just a number generator.
 */
export async function GET() {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const db = await store.read(scope.userId);
  const profile = db.profile;
  const evidence = gatherNutritionEvidence(db, profile);
  if (!evidence) {
    return NextResponse.json({ error: "Profile is missing height, weight or age." }, { status: 400 });
  }
  return NextResponse.json({ evidence, decision: decideNutrition(db, profile, evidence) });
}

export async function POST() {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const db = await store.read(scope.userId);
  const profile = db.profile;
  const evidence = gatherNutritionEvidence(db, profile);
  if (!evidence) {
    return NextResponse.json({ error: "Profile is missing height, weight or age." }, { status: 400 });
  }
  const decision = decideNutrition(db, profile, evidence);
  await store.applyNutritionDecision(scope.userId, decision);
  return NextResponse.json({ decision });
}
