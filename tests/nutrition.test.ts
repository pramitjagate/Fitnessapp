import { describe, expect, it } from "vitest";
import { bmr, macroTargets, missingInputs } from "@/lib/nutrition";
import { profile } from "./helpers";

describe("bmr — Mifflin-St Jeor", () => {
  it("matches the equation worked by hand", () => {
    // 10(78) + 6.25(178) - 5(27) + 5 = 780 + 1112.5 - 135 + 5
    expect(
      bmr(profile({ bodyweightKg: 78, heightCm: 178, age: 27, sex: "male" })),
    ).toBe(1763);
  });

  it("applies the female offset", () => {
    const p = { bodyweightKg: 62, heightCm: 165, age: 30 };
    const male = bmr(profile({ ...p, sex: "male" }));
    const female = bmr(profile({ ...p, sex: "female" }));
    expect(male - female).toBe(166); // +5 versus -161
  });

  it("splits the difference when sex is unspecified rather than refusing", () => {
    const p = { bodyweightKg: 62, heightCm: 165, age: 30 };
    const unspecified = bmr(profile({ ...p, sex: "unspecified" }));
    expect(unspecified).toBeLessThan(bmr(profile({ ...p, sex: "male" })));
    expect(unspecified).toBeGreaterThan(bmr(profile({ ...p, sex: "female" })));
  });
});

describe("macroTargets", () => {
  const p = profile({
    bodyweightKg: 78, heightCm: 178, age: 27, sex: "male",
    activity: "light", nutritionGoal: "cut",
  });

  it("returns null rather than guessing when inputs are missing", () => {
    expect(macroTargets(profile({ bodyweightKg: null }), 4)).toBeNull();
    expect(missingInputs(profile({ heightCm: null, age: null }))).toEqual([
      "height",
      "age",
    ]);
  });

  it("puts protein at 2.2 g/kg on a cut and fat at its 0.8 g/kg floor", () => {
    const t = macroTargets(p, 4)!;
    expect(t.proteinG).toBe(172);
    expect(t.fatG).toBe(62);
  });

  it("reconciles: training days and rest days sum to the weekly total", () => {
    // The split moves food to where the work is without changing the week.
    const t = macroTargets(p, 4)!;
    const weekly = t.trainingDayKcal * 4 + t.restDayKcal * 3;
    expect(Math.abs(weekly - t.averageKcal * 7)).toBeLessThanOrEqual(4);
  });

  it("makes training days the bigger ones", () => {
    const t = macroTargets(p, 4)!;
    expect(t.trainingDayKcal).toBeGreaterThan(t.restDayKcal);
  });

  describe("the safety floor", () => {
    /*
     * Writing these tests turned up something worth knowing: the floor is only
     * reachable for a sedentary person training roughly once a week. A 20% cut
     * from a maintenance figure that already includes an activity multiplier of
     * 1.2 lands at 0.96 x BMR, and each session adds 50 kcal a day back — so by
     * two sessions a week the percentage rule is already the safer of the two
     * and the floor never fires.
     *
     * That is correct behaviour, not a bug. But it means the floor is a
     * backstop for extreme inputs rather than something most users ever meet,
     * and these tests exist to keep it working for the few who do.
     */
    const sedentary = profile({
      bodyweightKg: 60, heightCm: 165, age: 30, sex: "female",
      activity: "sedentary", nutritionGoal: "cut",
    });

    it("never lets the target fall below resting requirement", () => {
      const t = macroTargets(sedentary, 1)!;
      expect(t.averageKcal).toBe(t.bmr);
      expect(t.averageKcal).toBeGreaterThan(Math.round(t.maintenance * 0.8));
    });

    it("says why it raised the target instead of doing it silently", () => {
      expect(macroTargets(sedentary, 1)!.warnings.join(" ")).toMatch(
        /resting requirement/i,
      );
    });

    it("stops firing once training puts the percentage rule above the floor", () => {
      const t = macroTargets(sedentary, 3)!;
      expect(t.averageKcal).toBeGreaterThan(t.bmr);
      expect(t.warnings.join(" ")).not.toMatch(/resting requirement/i);
    });
  });

  it("caps the deficit at 20% of maintenance", () => {
    const t = macroTargets(p, 4)!;
    expect(t.averageKcal).toBeGreaterThanOrEqual(Math.round(t.maintenance * 0.8) - 1);
  });

  it("warns that loads will hold when cutting on four or more sessions", () => {
    expect(macroTargets(p, 4)!.warnings.join(" ")).toMatch(/hold loads/i);
    expect(macroTargets(p, 2)!.warnings.join(" ")).not.toMatch(/hold loads/i);
  });

  it("puts a gain goal above maintenance and a hold goal at it", () => {
    expect(
      macroTargets(profile({ ...p, nutritionGoal: "gain" }), 4)!.averageKcal,
    ).toBeGreaterThan(macroTargets(p, 4)!.maintenance);
    const recomp = macroTargets(profile({ ...p, nutritionGoal: "recomp" }), 4)!;
    expect(recomp.averageKcal).toBe(recomp.maintenance);
  });
});
