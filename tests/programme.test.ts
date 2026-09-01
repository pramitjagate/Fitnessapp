import { describe, expect, it } from "vitest";
import { SPLITS, WEEKDAYS, buildStarterPlan, intentFrom, splitFor } from "@/lib/programme";
import { EMPTY_INTENT, emptyDatabase, needsProgrammeSetup } from "@/lib/seed";

const MONDAY = new Date("2026-08-31T12:00:00");

describe("buildStarterPlan", () => {
  it("puts a session on each chosen day and nothing on the rest", () => {
    const plan = buildStarterPlan("upper_lower", ["Monday", "Tuesday", "Thursday", "Friday"], MONDAY);
    expect(plan.sessions.map((s) => s.date)).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-03",
      "2026-09-04",
    ]);
  });

  it("orders sessions by weekday whatever order they were picked in", () => {
    const plan = buildStarterPlan("full_body", ["Friday", "Monday", "Wednesday"], MONDAY);
    expect(plan.sessions.map((s) => s.day)).toEqual(["Monday", "Wednesday", "Friday"]);
  });

  it("never prescribes a load", () => {
    // The rule this whole module exists to respect: the app has never seen this
    // person lift, so any number here is a guess dressed as a prescription.
    for (const split of SPLITS) {
      const plan = buildStarterPlan(split.key, [...WEEKDAYS], MONDAY);
      for (const session of plan.sessions) {
        for (const lift of session.mainLifts) expect(lift.weightKg).toBeNull();
      }
    }
  });

  it("wraps the rotation rather than dropping days", () => {
    // Five days on a three-day rotation runs the first two again. Silently
    // planning three sessions for someone who said five would be worse.
    const plan = buildStarterPlan("push_pull_legs", [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ], MONDAY);
    expect(plan.sessions).toHaveLength(5);
    expect(plan.sessions.map((s) => s.focus)).toEqual(["Push", "Pull", "Legs", "Push", "Pull"]);
  });

  it("leaves a custom split's days empty for the lifter to fill", () => {
    const plan = buildStarterPlan("custom", ["Monday"], MONDAY);
    expect(plan.sessions[0].mainLifts).toEqual([]);
  });

  it("claims no adaptation, because none happened", () => {
    const plan = buildStarterPlan("upper_lower", ["Monday"], MONDAY);
    expect(plan.adjustments).toEqual([]);
    expect(plan.blockWeek).toBe(1);
  });
});

describe("intentFrom", () => {
  it("records the training days and the rest days it derived", () => {
    const intent = intentFrom(EMPTY_INTENT, "upper_lower", ["Monday", "Thursday"], "Build muscle", false);
    expect(intent.daysPerWeek).toBe(2);
    expect(intent.split).toContain("Monday, Thursday");
    expect(intent.split).toContain("resting Tuesday");
    expect(intent.goal).toBe("Build muscle");
  });

  it("passes the deficit flag through, because it changes what success means", () => {
    // In a deficit, holding a load is the programme working rather than
    // stalling — the adaptation engine reads this flag to decide that.
    expect(intentFrom(EMPTY_INTENT, "full_body", ["Monday"], "Lose fat", true).inDeficit).toBe(true);
  });
});

describe("needsProgrammeSetup", () => {
  it("is true for a brand new account", () => {
    expect(needsProgrammeSetup(emptyDatabase())).toBe(true);
  });

  it("is false once a split and a week exist", () => {
    const db = emptyDatabase();
    db.intent = intentFrom(EMPTY_INTENT, "upper_lower", ["Monday"], "", false);
    db.currentPlan = buildStarterPlan("upper_lower", ["Monday"], MONDAY);
    expect(needsProgrammeSetup(db)).toBe(false);
  });

  it("is true again after a reset empties the plan", () => {
    const db = emptyDatabase();
    db.intent = intentFrom(EMPTY_INTENT, "upper_lower", ["Monday"], "", false);
    expect(needsProgrammeSetup(db)).toBe(true);
  });
});

describe("splitFor", () => {
  it("falls back rather than returning undefined on an unknown key", () => {
    expect(splitFor("nonsense" as never).key).toBe("full_body");
  });
});
