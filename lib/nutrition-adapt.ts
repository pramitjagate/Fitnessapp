import { addDays, iso } from "./dates";
import { macroTargets } from "./nutrition";
import type { Database, FoodEntry, NutritionDecision, Profile, WeightEntry } from "./types";

/* ---------------------------------------------------------------------------
 * The nutrition loop — the same governing rule as the training side.
 *
 *   Never change the target on one week. Two weeks is signal; one is noise.
 *
 * Bodyweight day to day is mostly water, salt and gut content; it moves ±1kg on
 * a diet that hasn't changed at all. So the input is a REGRESSION SLOPE over
 * fourteen days, not the difference between two mornings.
 *
 * And before the target is ever questioned, adherence is: if the food log says
 * you averaged 400 kcal over target, the target isn't wrong — it wasn't
 * followed. An app that lowers calories in response to un-followed calories is
 * chasing its own tail, and that is how a reasonable target becomes an
 * unreasonable one over a couple of months.
 * ------------------------------------------------------------------------- */

/** Change of at most this per review. Bounded so a bad fortnight can't swing it. */
const MAX_STEP_KCAL = 200;

/** Below this, the trend is inside the noise and "hold" is the honest answer. */
const TREND_TOLERANCE_KG = 0.15;

export interface DayTotals {
  date: string;
  kcal: number;
  protein: number;
  entries: number;
}

export function dayTotals(food: FoodEntry[], date: string): DayTotals {
  const rows = food.filter((f) => f.date === date);
  return {
    date,
    kcal: Math.round(rows.reduce((a, r) => a + r.kcal, 0)),
    protein: Math.round(rows.reduce((a, r) => a + r.protein, 0)),
    entries: rows.length,
  };
}

export function lastNDays(n: number, from = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => iso(addDays(from, -(n - 1 - i))));
}

/**
 * Least-squares slope over the window, converted to kg per week. A regression
 * uses every reading; first-minus-last throws away twelve of fourteen and lets
 * one salty dinner decide the outcome.
 */
export function weightTrendKgPerWeek(weights: WeightEntry[], days = 14): number | null {
  const window = lastNDays(days);
  const points = weights
    .filter((w) => window.includes(w.date))
    .map((w) => ({ x: window.indexOf(w.date), y: w.kg }));
  if (points.length < 6) return null;

  const n = points.length;
  const meanX = points.reduce((a, p) => a + p.x, 0) / n;
  const meanY = points.reduce((a, p) => a + p.y, 0) / n;
  const num = points.reduce((a, p) => a + (p.x - meanX) * (p.y - meanY), 0);
  const den = points.reduce((a, p) => a + (p.x - meanX) ** 2, 0);
  if (den === 0) return null;

  const perDay = num / den;
  return Math.round(perDay * 7 * 100) / 100;
}

export interface NutritionEvidence {
  daysLogged: number;
  daysInWindow: number;
  avgKcal: number | null;
  avgProtein: number | null;
  targetKcal: number;
  targetProtein: number;
  trendKgPerWeek: number | null;
  expectedKgPerWeek: number;
  weightReadings: number;
}

export function gatherNutritionEvidence(db: Database, profile: Profile): NutritionEvidence | null {
  const base = macroTargets(profile, db.intent.daysPerWeek);
  if (!base) return null;

  const window = lastNDays(14);
  const logged = window.map((d) => dayTotals(db.food, d)).filter((d) => d.entries > 0);
  const targetKcal = base.averageKcal + db.calorieAdjustment;

  return {
    daysLogged: logged.length,
    daysInWindow: 14,
    avgKcal: logged.length ? Math.round(logged.reduce((a, d) => a + d.kcal, 0) / logged.length) : null,
    avgProtein: logged.length
      ? Math.round(logged.reduce((a, d) => a + d.protein, 0) / logged.length)
      : null,
    targetKcal,
    targetProtein: base.proteinG,
    trendKgPerWeek: weightTrendKgPerWeek(db.weights),
    // What the intake gap predicts, at 7,700 kcal per kg.
    expectedKgPerWeek: Math.round((((targetKcal - base.maintenance) * 7) / 7700) * 100) / 100,
    weightReadings: db.weights.filter((w) => window.includes(w.date)).length,
  };
}

export function decideNutrition(
  db: Database,
  profile: Profile,
  ev: NutritionEvidence
): NutritionDecision {
  const base = macroTargets(profile, db.intent.daysPerWeek)!;
  const today = iso(new Date());
  const evidence = [
    `${ev.daysLogged} of ${ev.daysInWindow} days logged`,
    ev.avgKcal !== null
      ? `Averaged ${ev.avgKcal} kcal against a ${ev.targetKcal} target`
      : "No food logged",
    ev.avgProtein !== null
      ? `Averaged ${ev.avgProtein}g protein against ${ev.targetProtein}g`
      : "No protein data",
    ev.trendKgPerWeek !== null
      ? `Weight trending ${ev.trendKgPerWeek > 0 ? "+" : ""}${ev.trendKgPerWeek}kg a week over 14 days (${ev.weightReadings} readings)`
      : `Only ${ev.weightReadings} weigh-ins in 14 days — not enough for a trend`,
    `The target predicts ${ev.expectedKgPerWeek}kg a week`,
  ];

  // 1. Enough to look at?
  if (ev.trendKgPerWeek === null || ev.daysLogged < 8) {
    return {
      decision: "insufficient_evidence",
      deltaKcal: 0,
      reason:
        "Not enough to judge yet. Two weeks of weigh-ins and at least eight logged days is the bar — below it, any change is guessing dressed up as coaching.",
      evidence,
      decidedOn: today,
    };
  }

  // 2. Adherence before the target. Always.
  const gap = ev.avgKcal! - ev.targetKcal;
  if (Math.abs(gap) > 250) {
    return {
      decision: "adherence_first",
      deltaKcal: 0,
      reason:
        gap > 0
          ? `You've averaged ${gap} kcal a day over target. The target isn't what's wrong — it hasn't been followed yet. Changing it now would just move the number you're missing.`
          : `You've averaged ${Math.abs(gap)} kcal a day under target. Undereating a deficit isn't a faster deficit, it's the one you abandon in three weeks. Hit this target before changing it.`,
      evidence,
      decidedOn: today,
    };
  }

  const actual = ev.trendKgPerWeek;
  const expected = ev.expectedKgPerWeek;
  const drift = actual - expected;

  // 3. Losing much faster than intended — the most important branch to get
  //    right, because too-fast is where strength and muscle go.
  const fastLimit = -(profile.bodyweightKg! * 0.01);
  if (actual < fastLimit) {
    const raise = Math.min(MAX_STEP_KCAL, 150);
    return {
      decision: "raise",
      deltaKcal: raise,
      reason: `Losing ${Math.abs(actual)}kg a week — faster than 1% of bodyweight, which is where strength and muscle start going with the fat. Adding ${raise} kcal a day.`,
      evidence,
      decidedOn: today,
    };
  }

  // 4. Inside the noise band → change nothing, and say why.
  if (Math.abs(drift) <= TREND_TOLERANCE_KG) {
    return {
      decision: "hold",
      deltaKcal: 0,
      reason: `Trending ${actual}kg a week against a predicted ${expected}. That's inside the noise, which means the target is working. Change nothing.`,
      evidence,
      decidedOn: today,
    };
  }

  // 5. Followed the target, and it isn't doing what the equation said.
  if (drift > 0 && profile.nutritionGoal === "cut") {
    const proposed = ev.targetKcal - 150;
    if (proposed < base.bmr) {
      return {
        decision: "hold",
        deltaKcal: 0,
        reason: `Weight isn't moving as predicted, but lowering further would put you under your resting requirement of ${base.bmr} kcal. The answer here is more activity or more patience, not less food.`,
        evidence,
        decidedOn: today,
      };
    }
    return {
      decision: "lower",
      deltaKcal: -150,
      reason: `You've held the calorie target and lost ${Math.abs(actual)}kg a week against a predicted ${Math.abs(expected)}. The estimate was optimistic for you — that's what the ±10% means. Taking off 150 kcal.`,
      evidence,
      decidedOn: today,
    };
  }

  if (drift < 0 && profile.nutritionGoal === "gain") {
    return {
      decision: "raise",
      deltaKcal: 150,
      reason: `You've held the calorie target and gained less than predicted. Adding 150 kcal a day rather than doubling the surplus — a bigger jump mostly adds fat.`,
      evidence,
      decidedOn: today,
    };
  }

  return {
    decision: "hold",
    deltaKcal: 0,
    reason: `Trending ${actual}kg a week against a predicted ${expected}. Not the direction to act on for this goal — holding and watching another week.`,
    evidence,
    decidedOn: today,
  };
}

export function decisionLabel(d: NutritionDecision["decision"]): string {
  return {
    hold: "Change nothing",
    raise: "Raise calories",
    lower: "Lower calories",
    insufficient_evidence: "Not enough data yet",
    adherence_first: "Follow the target first",
  }[d];
}
