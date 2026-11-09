import { describe, expect, it } from "vitest";
import { adherence, lastLoads, liftSeries, rpeTrend } from "@/lib/analytics";
import { buildSeed } from "@/lib/seed";
import type { Database, LoggedAccessory, LoggedSession } from "@/lib/types";

function loggedSession(over: Partial<LoggedSession> = {}): LoggedSession {
  return {
    id: "s1",
    date: "2026-08-24",
    focus: "Upper",
    status: "completed",
    lifts: [],
    accessoriesCompleted: true,
    feedback: "",
    sleep: "good",
    sleepSource: "self_report",
    soreness: [],
    loggedAt: "2026-08-24T18:00:00Z",
    ...over,
  };
}

type Lift = LoggedSession["lifts"][number];

/*
 * The return type annotation is load-bearing. Without it "row" widens to
 * string, the tests still pass — vitest transpiles rather than typechecks —
 * and `tsc --noEmit` fails in CI instead. Green tests are not a typecheck.
 */
function lift(over: Partial<Lift> = {}): Lift {
  return {
    lift: "row",
    setsCompleted: 3,
    setsPrescribed: 3,
    repsCompleted: "8,8,8",
    repsPrescribed: "8",
    weightKg: 60,
    rpe: 7,
    hitAllReps: true,
    ...over,
  };
}

const db = (sessions: LoggedSession[]): Database => ({ ...buildSeed(), sessions });

describe("liftSeries — twice-weekly lifts", () => {
  it("collapses two sessions in one week to a single point", () => {
    const [row] = liftSeries(
      db([
        loggedSession({ id: "a", date: "2026-08-24", lifts: [lift({ weightKg: 60 })] }),
        loggedSession({ id: "b", date: "2026-08-27", lifts: [lift({ weightKg: 62.5 })] }),
      ]),
    );
    expect(row.points).toHaveLength(1);
    expect(row.points[0].weightKg).toBe(62.5); // the heavier of the two
  });

  it("keeps a miss from the lighter session rather than hiding it", () => {
    // The miss is the signal. Losing it behind the heavier session of the week
    // is how a real problem goes unnoticed.
    const [row] = liftSeries(
      db([
        loggedSession({
          id: "a", date: "2026-08-24",
          lifts: [lift({ weightKg: 60, hitAllReps: false })],
        }),
        loggedSession({
          id: "b", date: "2026-08-27",
          lifts: [lift({ weightKg: 62.5, hitAllReps: true })],
        }),
      ]),
    );
    expect(row.points[0].hitAllReps).toBe(false);
  });

  it("ignores skipped sessions entirely", () => {
    const series = liftSeries(db([loggedSession({ status: "skipped", lifts: [lift()] })]));
    expect(series).toHaveLength(0);
  });

  it("counts a flat stretch only while the load is unchanged", () => {
    const [row] = liftSeries(
      db([
        loggedSession({ id: "a", date: "2026-08-03", lifts: [lift({ weightKg: 60 })] }),
        loggedSession({ id: "b", date: "2026-08-10", lifts: [lift({ weightKg: 62.5 })] }),
        loggedSession({ id: "c", date: "2026-08-17", lifts: [lift({ weightKg: 62.5 })] }),
        loggedSession({ id: "d", date: "2026-08-24", lifts: [lift({ weightKg: 62.5 })] }),
      ]),
    );
    expect(row.weeksFlat).toBe(2);
    expect(row.deltaKg).toBe(2.5);
  });
});

describe("adherence and effort", () => {
  it("never reports more sessions logged than were planned", () => {
    const weeks = adherence(db([loggedSession({ lifts: [lift()] })]), 2);
    expect(weeks.length).toBeGreaterThan(0);
    for (const w of weeks) {
      expect(w.logged).toBeLessThanOrEqual(w.planned);
      expect(w.missedReps).toBeLessThanOrEqual(w.logged);
    }
  });

  it("reports average RPE only for weeks that have any", () => {
    for (const p of rpeTrend(db([loggedSession({ lifts: [lift({ rpe: 8 })] })]), 2)) {
      expect(p.avgRpe === null || (p.avgRpe >= 1 && p.avgRpe <= 10)).toBe(true);
    }
  });
});

describe("lastLoads — what carries into the next session", () => {
  const pushdown = (weightKg: number, over: Partial<LoggedAccessory> = {}): LoggedAccessory => ({
    exercise: "Tricep pushdown",
    setsCompleted: 3,
    repsCompleted: "12",
    weightKg,
    done: true,
    ...over,
  });

  it("takes the most recent session even when sessions arrive out of order", () => {
    const last = lastLoads(
      db([
        loggedSession({ id: "b", date: "2026-08-31", accessories: [pushdown(27.5)] }),
        loggedSession({ id: "a", date: "2026-08-24", accessories: [pushdown(25)] }),
      ]),
      "2026-09-07",
    );
    expect(last.accessories["tricep pushdown"].weightKg).toBe(27.5);
  });

  it("ignores the session being logged, skipped sessions, and skipped exercises", () => {
    const last = lastLoads(
      db([
        loggedSession({ id: "a", date: "2026-08-24", accessories: [pushdown(25)], lifts: [lift({ weightKg: 60 })] }),
        loggedSession({ id: "b", date: "2026-08-31", status: "skipped", accessories: [pushdown(40)] }),
        loggedSession({ id: "c", date: "2026-09-03", accessories: [pushdown(45, { done: false })] }),
        loggedSession({ id: "d", date: "2026-09-07", accessories: [pushdown(50)], lifts: [lift({ weightKg: 70 })] }),
      ]),
      "2026-09-07",
    );
    expect(last.accessories["tricep pushdown"].weightKg).toBe(25);
    expect(last.lifts.row.weightKg).toBe(60);
  });

  it("keeps per-set weights so a ramp comes back next week", () => {
    const last = lastLoads(
      db([
        loggedSession({
          accessories: [pushdown(25, { setWeightsKg: [20, 22.5, 25] })],
        }),
      ]),
      "2026-09-07",
    );
    expect(last.accessories["tricep pushdown"].setWeightsKg).toEqual([20, 22.5, 25]);
  });
});
