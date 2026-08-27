import { describe, expect, it } from "vitest";
import { decideByRules } from "@/lib/adapt";
import { evidence, session } from "./helpers";

/**
 * The decision table from the README, one case per row.
 *
 * This is the file to read first. If the rules engine and this table ever
 * disagree, one of them is wrong and it is worth stopping to work out which —
 * these six rows are the entire coaching argument the product makes.
 */
describe("decideByRules — the decision table", () => {
  const decide = (ev: ReturnType<typeof evidence>, blockWeek = 2) =>
    decideByRules([ev], blockWeek)[0];

  it("progresses when everything was completed at target RPE", () => {
    const d = decide(evidence({ history: [session({ rpe: 7 })] }));
    expect(d.decision).toBe("progress");
  });

  it("progresses a session the lifter called brutal, if the work was completed", () => {
    // The demo's headline case. Hard and too heavy are different things, and an
    // app that backs off on the word "brutal" is reading the wrong signal.
    const d = decide(
      evidence({
        history: [
          session({
            rpe: 8,
            feedback: "absolutely brutal, thought I'd have to drop the last set",
          }),
        ],
        targetRpe: 8,
      }),
    );
    expect(d.decision).toBe("progress");
  });

  it("holds when effort climbs at an unchanged load — a stall, not progress", () => {
    const d = decide(
      evidence({
        history: [
          session({ rpe: 9, weightKg: 60 }),
          session({ rpe: 7.5, weightKg: 60 }),
        ],
      }),
    );
    expect(d.decision).toBe("hold");
    expect(d.reason).toMatch(/stall/i);
  });

  it("holds on a single missed session — one is noise", () => {
    const d = decide(
      evidence({ history: [session({ hitAllReps: false, repsCompleted: "5,5,3" })] }),
    );
    expect(d.decision).toBe("hold");
  });

  it("holds on a miss with poor sleep, and blames life rather than the programme", () => {
    const d = decide(
      evidence({ history: [session({ hitAllReps: false, sleep: "poor" })] }),
    );
    expect(d.decision).toBe("hold");
    expect(d.reason).toMatch(/life/i);
  });

  it("cuts volume after two consecutive misses — two in a row is a pattern", () => {
    const d = decide(
      evidence({
        history: [
          session({ hitAllReps: false, repsCompleted: "5,4,4" }),
          session({ hitAllReps: false, repsCompleted: "5,5,3" }),
        ],
      }),
    );
    expect(d.decision).toBe("reduce_volume");
  });

  it("deloads in block week five regardless of how the week went", () => {
    const d = decide(evidence({ history: [session({ rpe: 6 })] }), 5);
    expect(d.decision).toBe("deload");
  });
});

describe("decideByRules — the guards that stop it detraining someone", () => {
  it("holds a lift that wasn't trained this week", () => {
    // Bug #3: without this, clicking generate twice took squat 3 -> 2 -> 1 sets
    // on completely unchanged evidence.
    const [d] = decideByRules(
      [
        evidence({
          loggedThisWeek: false,
          history: [session({ hitAllReps: false }), session({ hitAllReps: false })],
        }),
      ],
      2,
    );
    expect(d.decision).toBe("hold");
    expect(d.reason).toMatch(/no new evidence/i);
  });

  it("holds a lift with no history at all rather than guessing", () => {
    const [d] = decideByRules([evidence({ history: [] })], 2);
    expect(d.decision).toBe("hold");
  });

  it("decides every lift it is given, exactly once", () => {
    const decisions = decideByRules(
      [
        evidence({ lift: "squat", history: [session()] }),
        evidence({ lift: "bench", history: [session()] }),
        evidence({ lift: "row", history: [session()] }),
      ],
      2,
    );
    expect(decisions.map((d) => d.lift)).toEqual(["squat", "bench", "row"]);
  });

  it("never invents a decision outside the fixed set", () => {
    const allowed = ["progress", "hold", "reduce_load", "reduce_volume", "deload"];
    const decisions = decideByRules([evidence({ history: [session()] })], 2);
    for (const d of decisions) expect(allowed).toContain(d.decision);
  });
});
