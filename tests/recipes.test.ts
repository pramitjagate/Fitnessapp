import { describe, expect, it } from "vitest";
import { ALL_RECIPES, recipesFor } from "@/lib/recipes";

/**
 * Nutrition numbers are the kind of thing that looks authoritative and is
 * quietly wrong. These tests exist so a recipe can never disagree with its own
 * ingredients — the failure mode a language model produces on request and
 * nobody checks.
 */
describe("recipe macros are computed, not asserted", () => {
  it("matches an independent hand calculation", () => {
    // Chicken 180g, rice 200g, broccoli 150g, olive oil 10g, from the table.
    const protein = 31 * 1.8 + 2.7 * 2 + 2.8 * 1.5;
    const carbs = 28 * 2 + 7 * 1.5;
    const fat = 3.6 * 1.8 + 0.3 * 2 + 0.4 * 1.5 + 100 * 0.1;

    const bowl = ALL_RECIPES.find((r) => r.id === "chicken-rice")!;
    expect(bowl.protein).toBe(Math.round(protein));
    expect(bowl.carbs).toBe(Math.round(carbs));
    expect(bowl.fat).toBe(Math.round(fat));
  });

  it("keeps calories consistent with the macros, for every recipe", () => {
    // Atwater factors. A card that says 400 kcal next to macros summing to 600
    // is worse than no card.
    for (const r of ALL_RECIPES) {
      const fromMacros = r.protein * 4 + r.carbs * 4 + r.fat * 9;
      expect(Math.abs(r.kcal - fromMacros)).toBeLessThanOrEqual(12);
    }
  });

  it("has no recipe claiming zero calories or zero protein", () => {
    for (const r of ALL_RECIPES) {
      expect(r.kcal).toBeGreaterThan(0);
      expect(r.protein).toBeGreaterThan(0);
      expect(r.ingredients.length).toBeGreaterThan(0);
    }
  });

  it("computes protein density as protein per 100 kcal", () => {
    for (const r of ALL_RECIPES) {
      expect(r.proteinDensity).toBeCloseTo((r.protein / r.kcal) * 100, 1);
    }
  });
});

describe("recipe filtering", () => {
  it("returns only vegetarian recipes when asked", () => {
    expect(recipesFor({ vegetarianOnly: true }).every((r) => r.vegetarian)).toBe(true);
  });

  it("respects a time limit", () => {
    expect(recipesFor({ maxMinutes: 10 }).every((r) => r.minutes <= 10)).toBe(true);
  });

  it("sorts by protein density, densest first", () => {
    const d = recipesFor({}).map((r) => r.proteinDensity);
    expect([...d].sort((a, b) => b - a)).toEqual(d);
  });
});
