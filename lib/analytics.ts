import { iso, mondayOf } from "./dates";
import type { Database, LoggedSession } from "./types";

export interface WeekPoint {
  weekStart: string;
  weightKg: number;
  rpe: number | null;
  hitAllReps: boolean;
}

export interface LiftSeries {
  lift: string;
  points: WeekPoint[];
  /** Change from first to last logged week, in kg. */
  deltaKg: number;
  currentKg: number;
  /** Weeks since the load last moved — the plateau signal, visible at a glance. */
  weeksFlat: number;
}

function weekKey(date: string): string {
  return iso(mondayOf(new Date(date + "T12:00:00")));
}

/**
 * One series per lift, one point per week. A lift trained twice a week collapses
 * to its heaviest session, because the question these charts answer is "is the
 * load moving", not "what happened on Thursday".
 */
export function liftSeries(db: Database): LiftSeries[] {
  const byLift = new Map<string, Map<string, WeekPoint>>();

  for (const s of db.sessions) {
    if (s.status === "skipped") continue;
    const wk = weekKey(s.date);
    for (const l of s.lifts) {
      if (!byLift.has(l.lift)) byLift.set(l.lift, new Map());
      const weeks = byLift.get(l.lift)!;
      const existing = weeks.get(wk);
      if (!existing || l.weightKg > existing.weightKg) {
        weeks.set(wk, {
          weekStart: wk,
          weightKg: l.weightKg,
          rpe: l.rpe,
          // Keep the miss if either session that week missed — a miss is the
          // signal, and hiding it behind the heavier session would lose it.
          hitAllReps: (existing?.hitAllReps ?? true) && l.hitAllReps,
        });
      } else if (!l.hitAllReps) {
        existing.hitAllReps = false;
      }
    }
  }

  const out: LiftSeries[] = [];
  for (const [lift, weeks] of byLift) {
    const points = [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    if (points.length === 0) continue;

    const currentKg = points[points.length - 1].weightKg;
    let weeksFlat = 0;
    for (let i = points.length - 1; i > 0; i--) {
      if (points[i].weightKg === points[i - 1].weightKg) weeksFlat++;
      else break;
    }

    out.push({
      lift,
      points,
      currentKg,
      deltaKg: Math.round((currentKg - points[0].weightKg) * 4) / 4,
      weeksFlat,
    });
  }

  // Heaviest first — it reads as an ordering the athlete recognises.
  return out.sort((a, b) => b.currentKg - a.currentKg);
}

export interface WeekAdherence {
  weekStart: string;
  planned: number;
  logged: number;
  missedReps: number;
}

/** Sessions logged per week against the four-day template. */
export function adherence(db: Database, weeks = 9): WeekAdherence[] {
  const perWeek = new Map<string, LoggedSession[]>();
  for (const s of db.sessions) {
    const wk = weekKey(s.date);
    if (!perWeek.has(wk)) perWeek.set(wk, []);
    perWeek.get(wk)!.push(s);
  }

  const planned = db.currentPlan.sessions.length;
  return [...perWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-weeks)
    .map(([weekStart, sessions]) => ({
      weekStart,
      planned,
      logged: sessions.filter((s) => s.status === "completed").length,
      missedReps: sessions.filter((s) => s.lifts.some((l) => !l.hitAllReps)).length,
    }));
}

export interface RpePoint {
  weekStart: string;
  avgRpe: number;
}

/** Average RPE per week across all main lifts. Fatigue, as one number. */
export function rpeTrend(db: Database, weeks = 9): RpePoint[] {
  const perWeek = new Map<string, number[]>();
  for (const s of db.sessions) {
    if (s.status === "skipped") continue;
    const wk = weekKey(s.date);
    for (const l of s.lifts) {
      if (l.rpe === null) continue;
      if (!perWeek.has(wk)) perWeek.set(wk, []);
      perWeek.get(wk)!.push(l.rpe);
    }
  }
  return [...perWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-weeks)
    .map(([weekStart, values]) => ({
      weekStart,
      avgRpe: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
    }));
}
