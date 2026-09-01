import { describe, expect, it } from "vitest";
import { draftToPlan, liftFor, parsePlanByRules } from "@/lib/plan-import";

/* ---------------------------------------------------------------------------
 * The parser is allowed to miss things. It is not allowed to invent them.
 *
 * Every test here is about that asymmetry: a dropped exercise costs the lifter
 * ten seconds of typing, an invented one costs them a set they never agreed to.
 * ------------------------------------------------------------------------- */

const PLAN = `
A five day plan.

Monday: chest and triceps. Before you start, warm up.
1. Flat barbell bench press — 4 sets of 6 to 8
2. Incline dumbbell press — 3 sets of 10
3. Cable fly — 3 sets of 12

Tuesday: back and biceps
1. Barbell row — 4 sets of 8
2. Lat pulldown — 3 sets of 10

Wednesday: rest.

Thursday: shoulders
1. Seated dumbbell shoulder press — 4 sets of 8
2. Lateral raise — 3 sets of 15

Friday: deadlift, arms and core. This is the loosest day of the week.
1. Deadlift — 3 sets of 5
2. Romanian deadlift — 3 sets of 10
`;

describe("liftFor", () => {
  it("maps the five tracked lifts", () => {
    expect(liftFor("Flat barbell bench press")).toBe("bench");
    expect(liftFor("Back squat")).toBe("squat");
    expect(liftFor("Deadlift")).toBe("deadlift");
    expect(liftFor("Barbell row")).toBe("row");
    expect(liftFor("Seated dumbbell shoulder press")).toBe("overhead_press");
  });

  it("does not count a Romanian deadlift as the deadlift", () => {
    // The one that matters: an RDL logged as a deadlift would put a hinge
    // accessory into the progression of the heaviest lift in the programme.
    expect(liftFor("Romanian deadlift")).toBeNull();
    expect(liftFor("RDL")).toBeNull();
  });

  it("does not count a cable row as the barbell row", () => {
    expect(liftFor("Seated cable row")).toBeNull();
    expect(liftFor("Bent over barbell row")).toBe("row");
  });

  it("returns null for anything it does not recognise", () => {
    expect(liftFor("Lateral raise")).toBeNull();
    expect(liftFor("Cable fly")).toBeNull();
  });
});

describe("parsePlanByRules", () => {
  const draft = parsePlanByRules(PLAN);

  it("finds every training day and skips the rest day", () => {
    expect(draft.days.map((d) => d.day)).toEqual(["Monday", "Tuesday", "Thursday", "Friday"]);
  });

  it("keeps a day whose heading is followed by prose", () => {
    // Friday's heading runs into a sentence. An earlier version of the focus
    // regex swallowed the paragraph and dropped the day entirely.
    const friday = draft.days.find((d) => d.day === "Friday")!;
    expect(friday.exercises).toHaveLength(2);
  });

  it("does not take a word of the following sentence into the focus", () => {
    expect(draft.days[0].focus).toBe("chest and triceps");
  });

  it("reads sets and reps as written, normalising the range", () => {
    const bench = draft.days[0].exercises[0];
    expect(bench.name).toBe("Flat barbell bench press");
    expect(bench.sets).toBe(4);
    expect(bench.reps).toBe("6-8");
    expect(bench.lift).toBe("bench");
  });

  it("marks itself as the rules source so the UI can say so", () => {
    expect(draft.source).toBe("rules");
  });

  it("returns no days rather than a guess when there is nothing to read", () => {
    expect(parsePlanByRules("Some blog post about protein.").days).toEqual([]);
  });
});

describe("draftToPlan", () => {
  const plan = draftToPlan(parsePlanByRules(PLAN), new Date("2026-08-31T12:00:00"));

  it("dates each session from the week start by weekday", () => {
    expect(plan.sessions.map((s) => s.date)).toEqual([
      "2026-08-31", // Monday
      "2026-09-01",
      "2026-09-03", // Thursday — Wednesday was a rest day and is not a session
      "2026-09-04",
    ]);
  });

  it("splits tracked lifts from accessories", () => {
    const monday = plan.sessions[0];
    expect(monday.mainLifts.map((l) => l.lift)).toEqual(["bench"]);
    expect(monday.accessories).toHaveLength(2);
  });

  it("never invents a load", () => {
    // The whole reason weightKg is nullable. An imported plan prescribes
    // movements and rep ranges; a number here would be indistinguishable from
    // one the adaptation engine earned from logged history.
    for (const session of plan.sessions) {
      for (const lift of session.mainLifts) expect(lift.weightKg).toBeNull();
    }
  });

  it("records no adjustments, because nothing was adapted", () => {
    expect(plan.adjustments).toEqual([]);
    expect(plan.blockWeek).toBe(1);
  });
});
