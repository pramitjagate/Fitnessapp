import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { addDays, dayName, iso, mondayOf } from "./dates";
import {
  AdaptationDecision,
  type Database,
  type LoggedLift,
  type LoggedSession,
  type PlannedSession,
  type WeeklyPlan,
} from "./types";

/* ---------------------------------------------------------------------------
 * ARCHITECTURE NOTE — the most important decision in this file.
 *
 * The model is NOT asked to produce the weekly plan. It is asked only for
 * JUDGEMENT: per lift, what should happen and why, plus the coaching notes.
 * Code then applies those decisions to the previous plan to build the new one.
 *
 * Asking a model to emit a whole plan means it can invent dates, drop a
 * session, contradict the schema, or hallucinate a load. Asking it only for a
 * decision from a fixed set means the worst case is a wrong judgement — which
 * is visible and arguable — rather than a broken plan.
 *
 * Rule of thumb: let the model do judgement, let code do structure.
 * ------------------------------------------------------------------------- */

export interface LiftEvidence {
  lift: string;
  currentLoadKg: number;
  targetRpe: number;
  setsPrescribed: number;
  /**
   * Whether this lift was actually trained in the week being adapted from.
   * A lift with no session this week has no new evidence, and deciding it on
   * last week's data applies the same decision twice.
   */
  loggedThisWeek: boolean;
  /** Most recent week first. */
  history: {
    date: string;
    weightKg: number;
    rpe: number | null;
    hitAllReps: boolean;
    repsCompleted: string;
    repsPrescribed: string;
    sleep: string | null;
    feedback: string;
  }[];
}

/** Pull the last N weeks of evidence for every lift in the current plan. */
/**
 * Pure filter over data already in hand — it lived in the store while the store
 * was a JSON blob, which made it look like a query. It isn't one, and leaving it
 * there would have meant a Postgres round-trip for a two-line array filter.
 */
function sessionsBetween(db: Database, startIso: string, endIso: string): LoggedSession[] {
  return db.sessions.filter((s) => s.date >= startIso && s.date <= endIso);
}

export function gatherEvidence(db: Database, weeks = 3): LiftEvidence[] {
  const plan = db.currentPlan;
  const start = iso(addDays(new Date(plan.weekStart + "T12:00:00"), -7 * weeks));
  const end = plan.weekEnd;
  const recent = sessionsBetween(db, start, end);

  const byLift = new Map<string, LiftEvidence>();

  for (const session of plan.sessions) {
    for (const ml of session.mainLifts) {
      if (!byLift.has(ml.lift)) {
        byLift.set(ml.lift, {
          lift: ml.lift,
          currentLoadKg: ml.weightKg ?? 0,
          targetRpe: ml.targetRpe,
          setsPrescribed: ml.sets,
          loggedThisWeek: false,
          history: [],
        });
      }
    }
  }

  for (const s of [...recent].reverse()) {
    for (const l of s.lifts) {
      const ev = byLift.get(l.lift);
      if (!ev) continue;
      if (s.date >= plan.weekStart && s.date <= plan.weekEnd) {
        ev.loggedThisWeek = true;
      }
      ev.history.push({
        date: s.date,
        weightKg: l.weightKg,
        rpe: l.rpe,
        hitAllReps: l.hitAllReps,
        repsCompleted: l.repsCompleted,
        repsPrescribed: l.repsPrescribed,
        sleep: s.sleep,
        feedback: s.feedback,
      });
    }
  }

  return [...byLift.values()];
}

/* ---------------------------------------------------------------------------
 * The rules engine.
 *
 * This is a direct implementation of the decision table from the brief. It
 * exists for two reasons: the app must run with no API key, and having a
 * deterministic baseline is the only way to tell whether the model is adding
 * anything. If the model never disagrees with these rules, it isn't earning
 * its cost.
 * ------------------------------------------------------------------------- */
export function decideByRules(
  evidence: LiftEvidence[],
  blockWeek: number
): AdaptationDecision[] {
  return evidence.map((ev): AdaptationDecision => {
    const [latest, previous] = ev.history;

    if (blockWeek >= 5) {
      return {
        lift: ev.lift,
        decision: "deload",
        reason: "Week five of the block — a planned deload, not a response to anything.",
      };
    }

    if (!latest) {
      return {
        lift: ev.lift,
        decision: "hold",
        reason: "Nothing logged for this lift, so there is no basis for a change.",
      };
    }

    // No session for this lift in the week being adapted from. Its most recent
    // data already drove the current plan — acting on it again applies the same
    // decision twice, which is how a cut compounds into detraining.
    if (!ev.loggedThisWeek) {
      return {
        lift: ev.lift,
        decision: "hold",
        reason: "Not trained yet this week, so there is no new evidence. Last week's data already shaped the current plan.",
      };
    }

    const missedNow = !latest.hitAllReps;
    const missedBefore = previous ? !previous.hitAllReps : false;

    // Two consecutive weeks of missed reps is the clearest volume signal.
    if (missedNow && missedBefore) {
      return {
        lift: ev.lift,
        decision: "reduce_volume",
        reason: `Reps missed in two consecutive sessions (${previous.repsCompleted} then ${latest.repsCompleted} against ${latest.repsPrescribed}). Two in a row is a pattern, so volume comes down and the load stays.`,
      };
    }

    // One miss with poor sleep is life, not programming.
    if (missedNow && latest.sleep === "poor") {
      return {
        lift: ev.lift,
        decision: "hold",
        reason: "Reps missed once, on poor sleep. That is life rather than the programme — repeat the week before changing anything.",
      };
    }

    // A single miss is noise. The rule that stops the app detraining people.
    if (missedNow) {
      return {
        lift: ev.lift,
        decision: "hold",
        reason: `Reps missed once (${latest.repsCompleted} against ${latest.repsPrescribed}). One session is noise — hold and see whether it repeats.`,
      };
    }

    // Effort climbing at an unchanged load is a stall.
    const rpeDrift =
      latest.rpe !== null &&
      previous?.rpe != null &&
      latest.weightKg === previous.weightKg &&
      latest.rpe > previous.rpe + 0.5;

    if (rpeDrift || (latest.rpe !== null && latest.rpe > ev.targetRpe + 1)) {
      return {
        lift: ev.lift,
        decision: "hold",
        reason: `Work completed, but at RPE ${latest.rpe} against a target of ${ev.targetRpe}. Effort climbing at a load that isn't is a stall — adding weight now buys a missed session.`,
      };
    }

    // Everything completed at or under target: the programme is working.
    return {
      lift: ev.lift,
      decision: "progress",
      reason: `All sets completed at RPE ${latest.rpe ?? "unrecorded"}, at or under the target of ${ev.targetRpe}. Progresses per the programme.`,
    };
  });
}

/* ---------------------------------------------------------------------------
 * The model path.
 * ------------------------------------------------------------------------- */

const ModelResponse = z.object({
  decisions: z.array(
    z.object({
      lift: z.string(),
      decision: z.enum(["progress", "hold", "reduce_load", "reduce_volume", "deload"]),
      reason: z.string(),
    })
  ),
  coachingNotes: z.record(z.string(), z.string()),
  rationale: z.string(),
});

const SYSTEM_PROMPT = `You are a strength coach deciding what changes to a lifter's programme for the coming week. You are not writing the plan — code does that. You return judgement only.

THE GOVERNING RULE
Never change the programme on the strength of one session. Two in a row is signal; one is noise. An app that responds to every complaint will politely detrain someone over about six weeks, and "change nothing" is the correct answer more often than a lifter expects.

HOW TO READ THE EVIDENCE
Performance is the anchor, perception explains it. Judge on what was completed first, then use how it felt to explain why.

- Completed everything at or under target RPE -> the programme is working. PROGRESS. If the lifter says it was brutal, that is what the right weight feels like, and saying so is the coaching.
- Completed everything but RPE has climbed at an unchanged load -> a stall. HOLD.
- Missed reps once -> noise. HOLD.
- Missed reps once on poor sleep -> life, not the programme. HOLD.
- Missed reps two sessions running -> volume beyond recovery. REDUCE_VOLUME, keep the load.
- Block week five -> DELOAD everything, regardless of how the week looked.

CONTEXT THAT CHANGES THE READING
If the lifter is eating in a calorie deficit, holding a load steady week to week is a SUCCESS, not a stall. Do not read maintenance as failure, and never respond to poor performance by suggesting they eat less.

WHAT YOU RETURN
Strict JSON, no prose around it, no markdown fences:
{
  "decisions": [{"lift": "squat", "decision": "hold", "reason": "one sentence naming the actual numbers"}],
  "coachingNotes": {"squat": "one or two sentences spoken to the lifter, about this week"},
  "rationale": "two or three sentences summarising the week's logic"
}

A decision must be one of: progress, hold, reduce_load, reduce_volume, deload.
Include every lift you were given evidence for, and nothing else.

Every number in a reason must come from the evidence you were given. Do not cite a session, a weight or an RPE that is not in the data — a fabricated comparison sounds exactly like a real one and the lifter has no way to tell.`;

export async function decideByModel(
  evidence: LiftEvidence[],
  db: Database,
  upcomingBlockWeek: number
): Promise<{ decisions: AdaptationDecision[]; notes: Record<string, string>; rationale: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: JSON.stringify(
          {
            programme: db.intent,
            blockWeek: upcomingBlockWeek,
            evidence,
          },
          null,
          2
        ),
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  const parsed = ModelResponse.parse(JSON.parse(text));
  return {
    decisions: parsed.decisions,
    notes: parsed.coachingNotes,
    rationale: parsed.rationale,
  };
}

/* ---------------------------------------------------------------------------
 * Applying decisions to build the next plan. Pure code, no model involvement,
 * so dates and structure are always valid.
 * ------------------------------------------------------------------------- */

const STEP: Record<string, number> = {
  squat: 2.5,
  deadlift: 2.5,
  bench: 1.25,
  overhead_press: 1.25,
  row: 1.25,
  other: 1.25,
};

function round(n: number): number {
  return Math.round(n * 4) / 4;
}

export function applyDecisions(
  previous: WeeklyPlan,
  decisions: AdaptationDecision[],
  notes: Record<string, string>,
  rationale: string
): WeeklyPlan {
  const byLift = new Map(decisions.map((d) => [d.lift, d]));
  const nextStart = addDays(new Date(previous.weekStart + "T12:00:00"), 7);
  const blockWeek = previous.blockWeek >= 5 ? 1 : previous.blockWeek + 1;

  const sessions: PlannedSession[] = previous.sessions.map((s) => {
    const offset = Math.round(
      (new Date(s.date + "T12:00:00").getTime() -
        new Date(previous.weekStart + "T12:00:00").getTime()) /
        86_400_000
    );
    const date = iso(addDays(nextStart, offset));

    const mainLifts = s.mainLifts.map((ml) => {
      const d = byLift.get(ml.lift);
      const step = STEP[ml.lift] ?? 1.25;
      const current = ml.weightKg ?? 0;

      switch (d?.decision) {
        case "progress":
          return { ...ml, weightKg: round(current + step) };
        case "reduce_load":
          return { ...ml, weightKg: round(current * 0.9) };
        case "reduce_volume":
          return { ...ml, sets: Math.max(1, ml.sets - 1) };
        case "deload":
          return { ...ml, weightKg: round(current * 0.85), sets: Math.max(1, ml.sets - 1), targetRpe: 6 };
        default:
          return { ...ml }; // hold, or no decision — change nothing
      }
    });

    const note = s.mainLifts
      .map((ml) => notes[ml.lift])
      .filter(Boolean)
      .join(" ");

    return {
      ...s,
      day: dayName(date),
      date,
      phase: blockWeek >= 5 ? ("deload" as const) : s.phase,
      mainLifts,
      coachingNote: note || s.coachingNote,
    };
  });

  return {
    weekStart: iso(nextStart),
    weekEnd: iso(addDays(nextStart, 6)),
    blockWeek,
    summary: summarise(decisions),
    sessions,
    adjustments: decisions
      .filter((d) => d.decision !== "progress")
      .map((d) => `${label(d.lift)}: ${d.reason}`),
    rationale,
  };
}

function label(lift: string): string {
  return lift.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function summarise(decisions: AdaptationDecision[]): string {
  const held = decisions.filter((d) => d.decision === "hold").length;
  const progressed = decisions.filter((d) => d.decision === "progress").length;
  const cut = decisions.filter(
    (d) => d.decision === "reduce_volume" || d.decision === "reduce_load"
  ).length;
  if (decisions.some((d) => d.decision === "deload")) return "Deload week";
  const parts: string[] = [];
  if (progressed) parts.push(`${progressed} progressing`);
  if (held) parts.push(`${held} holding`);
  if (cut) parts.push(`${cut} reduced`);
  return parts.join(", ") || "No changes";
}

/** The whole loop: evidence in, next week's plan out. */
export async function adapt(db: Database) {
  const evidence = gatherEvidence(db);
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  // The deload check applies to the week being PLANNED, not the week just
  // finished. Passing the current block week here was an off-by-one that
  // silently skipped every deload.
  const upcomingBlockWeek =
    db.currentPlan.blockWeek >= 5 ? 1 : db.currentPlan.blockWeek + 1;

  // Adaptation needs evidence from the week being adapted FROM. Without this
  // guard, running it twice applies the same decision twice — squat volume was
  // cut 3 -> 2 -> 1 -> 1 on repeated clicks with nothing new logged, which is
  // how an adaptive app quietly detrains someone.
  const loggedThisWeek = db.sessions.filter(
    (s) => s.date >= db.currentPlan.weekStart && s.date <= db.currentPlan.weekEnd
  );

  if (loggedThisWeek.length === 0) {
    const decisions: AdaptationDecision[] = evidence.map((ev) => ({
      lift: ev.lift,
      decision: "hold" as const,
      reason:
        "Nothing logged for this week yet, so there is no new evidence to act on. Log the week's sessions and run this again.",
    }));
    return {
      plan: applyDecisions(
        db.currentPlan,
        decisions,
        {},
        "No sessions logged for the current week, so nothing changed. Adaptation acts on what happened, and nothing has happened yet."
      ),
      decisions,
      source: "rules" as const,
      note: "No sessions logged this week — held everything rather than re-applying last week's decisions.",
    };
  }

  if (hasKey) {
    try {
      const { decisions, notes, rationale } = await decideByModel(
        evidence,
        db,
        upcomingBlockWeek
      );
      return {
        plan: applyDecisions(db.currentPlan, decisions, notes, rationale),
        decisions,
        source: "model" as const,
      };
    } catch (err) {
      // A malformed response must never break the week. Fall back to the rules
      // and say so, rather than failing or silently inventing a plan.
      const decisions = decideByRules(evidence, upcomingBlockWeek);
      return {
        plan: applyDecisions(
          db.currentPlan,
          decisions,
          {},
          "Generated by the rule engine after the model response could not be used."
        ),
        decisions,
        source: "rules" as const,
        note: `Model call failed, fell back to rules: ${(err as Error).message}`,
      };
    }
  }

  const decisions = decideByRules(evidence, upcomingBlockWeek);
  return {
    plan: applyDecisions(
      db.currentPlan,
      decisions,
      {},
      "Generated by the rule engine. Set ANTHROPIC_API_KEY to have the model make these calls instead."
    ),
    decisions,
    source: "rules" as const,
  };
}
