import { describe, expect, it } from "vitest";
import { buildSeed } from "@/lib/seed";
import {
  decideNutrition,
  gatherNutritionEvidence,
  lastNDays,
  weightTrendKgPerWeek,
} from "@/lib/nutrition-adapt";
import type { Database, WeightEntry } from "@/lib/types";
import { profile } from "./helpers";

const P = profile({
  bodyweightKg: 78, heightCm: 178, age: 27, sex: "male",
  activity: "light", nutritionGoal: "cut",
});

/** A weight series with a known true slope, laid over the real 14-day window. */
function weights(kgPerDay: number, start = 78): WeightEntry[] {
  return lastNDays(14).map((date, i) => ({ date, kg: start - kgPerDay * i }));
}

/** Food logged at a given daily intake, for `days` of the window. */
function food(kcalPerDay: number, days = 12): Database["food"] {
  return lastNDays(14)
    .slice(-days)
    .map((date, i) => ({
      id: `f${i}`,
      date,
      label: "test meal",
      kcal: kcalPerDay,
      protein: 150,
      carbs: 0,
      fat: 0,
      source: "custom" as const,
    }));
}

function db(over: Partial<Database> = {}): Database {
  return {
    ...buildSeed(),
    profile: P,
    food: [],
    weights: [],
    calorieAdjustment: 0,
    ...over,
  };
}

const decide = (d: Database) => decideNutrition(d, P, gatherNutritionEvidence(d, P)!);

describe("weightTrendKgPerWeek", () => {
  it("recovers a known slope from a clean series", () => {
    expect(weightTrendKgPerWeek(weights(0.05))).toBeCloseTo(-0.35, 2);
  });

  it("is not fooled by one bad morning", () => {
    // A regression uses every reading. First-minus-last would report this
    // series as flat because of a single salty dinner on the last day.
    const noisy = weights(0.05);
    noisy[noisy.length - 1].kg += 0.9;
    expect(weightTrendKgPerWeek(noisy)).toBeLessThan(-0.1);
  });

  it("refuses to report a trend from fewer than six readings", () => {
    expect(weightTrendKgPerWeek(weights(0.05).slice(0, 5))).toBeNull();
  });
});

describe("decideNutrition — the five branches", () => {
  it("says insufficient_evidence before the bar is met", () => {
    expect(decide(db({ weights: weights(0.05), food: food(1990, 4) })).decision).toBe(
      "insufficient_evidence",
    );
  });

  it("checks adherence before it questions the target", () => {
    // Averaging 600 over target: the target isn't wrong, it wasn't followed.
    // Lowering calories here is how an app chases its own tail.
    const d = decide(db({ weights: weights(0), food: food(2600) }));
    expect(d.decision).toBe("adherence_first");
    expect(d.deltaKcal).toBe(0);
  });

  it("also flags undereating, not just overeating", () => {
    const d = decide(db({ weights: weights(0.2), food: food(1400) }));
    expect(d.decision).toBe("adherence_first");
  });

  it("holds when the trend sits inside the noise band", () => {
    // Predicted about -0.45kg/week; -0.38 is close enough to leave alone.
    const d = decide(db({ weights: weights(0.055), food: food(1990) }));
    expect(d.decision).toBe("hold");
    expect(d.deltaKcal).toBe(0);
  });

  it("raises calories when losing faster than 1% of bodyweight a week", () => {
    const d = decide(db({ weights: weights(0.16), food: food(1990) }));
    expect(d.decision).toBe("raise");
    expect(d.deltaKcal).toBe(150);
  });

  it("lowers calories when the target was held and the weight didn't move", () => {
    const d = decide(db({ weights: weights(0), food: food(1990) }));
    expect(d.decision).toBe("lower");
    expect(d.deltaKcal).toBe(-150);
  });

  it("refuses to lower below the resting requirement, and says so", () => {
    // Already cut to just above BMR: the answer is activity or patience,
    // never less food.
    const nearFloor = db({
      weights: weights(0),
      calorieAdjustment: -(1994 - 1763) + 100,
    });
    const d = decide({ ...nearFloor, food: food(1863) });
    expect(d.decision).toBe("hold");
    expect(d.reason).toMatch(/resting requirement/i);
  });

  it("never moves the target by more than one step", () => {
    for (const slope of [0, 0.05, 0.1, 0.16, 0.3]) {
      const d = decide(db({ weights: weights(slope), food: food(1990) }));
      expect(Math.abs(d.deltaKcal)).toBeLessThanOrEqual(200);
    }
  });

  it("always shows its evidence, whatever it decides", () => {
    const d = decide(db({ weights: weights(0.05), food: food(1990) }));
    expect(d.evidence.length).toBeGreaterThanOrEqual(4);
    expect(d.evidence.join(" ")).toMatch(/days logged/);
  });
});
