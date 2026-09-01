import { addDays, dayName, iso, mondayOf } from "./dates";
import { emptyExtraction, extractByRules } from "./extract";
import { BLANK_PROFILE, DEFAULT_MUSIC_PREFS, DEFAULT_PROFILE } from "./types";
import type {
  AdaptationDecision,
  FoodEntry,
  WeightEntry,
  Database,
  LoggedSession,
  PlannedSession,
  ProgramIntent,
  WeeklyPlan,
} from "./types";

/**
 * Eight weeks of history for a 4-day upper/lower split, generated relative to
 * today so the demo never goes stale.
 *
 * The history is scripted to contain the two moments that make the product
 * legible in under a minute:
 *
 *   - week 6: bench RPE climbs at an unchanged load, so bench HOLDS
 *   - week 7: a session the lifter described as brutal but completed at
 *     target RPE, so the answer is CHANGE NOTHING
 *   - week 7: squat reps missed two weeks running, so volume is cut
 *
 * Without those, a reviewer sees a logging app.
 */

const INTENT: ProgramIntent = {
  daysPerWeek: 4,
  split: "Upper / lower, Monday and Thursday upper, Tuesday and Friday lower",
  goal: "Build muscle while holding a small calorie deficit",
  progressionRule:
    "Double progression. When every set hits the top of the rep range at or below target RPE, add 2.5kg to squat and deadlift, 1.25kg to bench, row and overhead press. Never add weight on a schedule.",
  notes:
    "Trains alone. Safety pins on every squat and bench set. Deload every fifth week.",
  inDeficit: true,
};

/* ---------------------------------------------------------------------------
 * Food and weight history.
 *
 * Scripted to demonstrate the branch that matters most: adherence is GOOD —
 * the target was actually followed — and the weight still isn't moving the way
 * the equation predicted. That's the case where changing the target is the
 * right answer, and it's only trustworthy because the adherence check passed
 * first.
 *
 * Deterministic pseudo-random, not Math.random: a demo that reads differently
 * on every reload can't be reasoned about, and a bug that appears one run in
 * five is a bug nobody fixes.
 * ------------------------------------------------------------------------- */

function wobble(seed: number): number {
  // Cheap LCG, mapped to roughly [-1, 1].
  const x = (seed * 1103515245 + 12345) % 2147483648;
  return (x / 2147483648) * 2 - 1;
}

function buildWeights(today: Date): WeightEntry[] {
  const out: WeightEntry[] = [];
  for (let i = 20; i >= 0; i--) {
    const date = iso(addDays(today, -i));
    // A slow true trend (-0.02kg/day) buried in day-to-day water noise of
    // ±0.4kg — which is exactly why the loop regresses rather than subtracting
    // two mornings.
    const trend = 78.0 - 0.02 * (20 - i);
    const noise = wobble(i + 7) * 0.4;
    // Sunday weigh-ins get skipped, like everyone's do.
    if (new Date(date + "T12:00:00").getDay() === 0) continue;
    out.push({ date, kg: Math.round((trend + noise) * 10) / 10 });
  }
  return out;
}

const MEALS: [string, number, number, number, number][] = [
  // label, kcal, protein, carbs, fat
  ["Protein overnight oats", 509, 43, 64, 9],
  ["Chicken, rice and broccoli bowl", 687, 65, 67, 18],
  ["Post-lift shake", 415, 39, 43, 10],
  ["Greek yogurt protein bowl", 382, 41, 34, 9],
  ["Tuna and chickpea salad", 540, 52, 47, 16],
  ["Rajma with rice", 631, 26, 110, 10],
  ["Eggs on toast", 431, 38, 39, 14],
  ["Coffee and a flapjack", 320, 5, 44, 14],
];

function buildFood(today: Date): FoodEntry[] {
  const out: FoodEntry[] = [];
  for (let i = 13; i >= 0; i--) {
    const date = iso(addDays(today, -i));
    // Two missed days in a fortnight. A log with a perfect streak is fiction,
    // and the adherence check needs to be exercised against real gaps.
    if (i === 4 || i === 9) continue;
    const picks = [0, 1, 2, 3].map((slot) => MEALS[(i * 3 + slot * 5) % MEALS.length]);
    picks.forEach(([label, kcal, protein, carbs, fat], slot) => {
      out.push({
        id: `food-${date}-${slot}`,
        date,
        label,
        kcal,
        protein,
        carbs,
        fat,
        source: "recipe",
      });
    });
  }
  return out;
}

type DayTemplate = {
  offset: number;
  focus: string;
  phase: PlannedSession["phase"];
  lifts: { lift: PlannedSession["mainLifts"][number]["lift"]; sets: number; reps: string; base: number; step: number; rpe: number }[];
  accessories: { exercise: string; sets: number; reps: string; notes?: string }[];
};

const TEMPLATE: DayTemplate[] = [
  {
    offset: 0,
    focus: "Upper — press",
    phase: "volume",
    lifts: [
      { lift: "bench", sets: 3, reps: "5", base: 60, step: 1.25, rpe: 7.5 },
      { lift: "row", sets: 3, reps: "8", base: 55, step: 1.25, rpe: 7 },
    ],
    accessories: [
      { exercise: "Incline dumbbell press", sets: 3, reps: "10-12" },
      { exercise: "Lat pulldown", sets: 3, reps: "10-12" },
      { exercise: "Rope pushdown", sets: 3, reps: "12-15" },
    ],
  },
  {
    offset: 1,
    focus: "Lower — squat",
    phase: "volume",
    lifts: [{ lift: "squat", sets: 3, reps: "5", base: 85, step: 2.5, rpe: 7.5 }],
    accessories: [
      { exercise: "Romanian deadlift", sets: 3, reps: "8-10", notes: "Controlled eccentric" },
      { exercise: "Leg curl", sets: 3, reps: "12" },
      { exercise: "Calf raise", sets: 3, reps: "15-20" },
    ],
  },
  {
    offset: 3,
    focus: "Upper — overhead",
    phase: "technique",
    lifts: [
      { lift: "overhead_press", sets: 3, reps: "5", base: 42.5, step: 1.25, rpe: 7 },
      { lift: "row", sets: 3, reps: "10", base: 50, step: 1.25, rpe: 7 },
    ],
    accessories: [
      { exercise: "Lateral raise", sets: 3, reps: "12-15", notes: "Lighter than feels impressive" },
      { exercise: "Face pull", sets: 3, reps: "15" },
      { exercise: "Hammer curl", sets: 3, reps: "10-12" },
    ],
  },
  {
    offset: 4,
    focus: "Lower — deadlift",
    phase: "heavy_singles",
    lifts: [{ lift: "deadlift", sets: 3, reps: "5", base: 110, step: 2.5, rpe: 8 }],
    accessories: [
      { exercise: "Hanging knee raise", sets: 3, reps: "10-12" },
      { exercise: "Cable crunch", sets: 3, reps: "12-15" },
    ],
  },
];

/** Weeks are 0-indexed here; week 0 is eight weeks ago. */
function loadFor(base: number, step: number, week: number, lift: string): number {
  // Bench stalls from week 5 onward; squat stops progressing from week 6.
  let progressedWeeks = week;
  if (lift === "bench" && week > 5) progressedWeeks = 5;
  if (lift === "squat" && week > 6) progressedWeeks = 6;
  if (lift === "row" && week > 7) progressedWeeks = 7;
  return base + step * progressedWeeks;
}

function buildPlan(weekStartDate: Date, week: number): WeeklyPlan {
  const sessions: PlannedSession[] = TEMPLATE.map((t) => {
    const date = iso(addDays(weekStartDate, t.offset));
    const isDeload = (week + 1) % 5 === 0;
    return {
      day: dayName(date),
      date,
      focus: t.focus,
      phase: isDeload ? "deload" : t.phase,
      mainLifts: t.lifts.map((l) => ({
        lift: l.lift,
        sets: isDeload ? Math.max(1, l.sets - 1) : l.sets,
        reps: l.reps,
        weightKg: Math.round(loadFor(l.base, l.step, week, l.lift) * (isDeload ? 0.85 : 1) * 4) / 4,
        targetRpe: isDeload ? 6 : l.rpe,
        loadNote: undefined,
      })),
      accessories: t.accessories,
      coachingNote: "",
    };
  });

  const weekEnd = iso(addDays(weekStartDate, 6));
  return {
    weekStart: iso(weekStartDate),
    weekEnd,
    blockWeek: (week % 5) + 1,
    summary: "Upper/lower, four days",
    sessions,
    adjustments: [],
    rationale: "",
  };
}

/** Deviations from the plan, keyed by "week:lift". */
const DEVIATIONS: Record<string, { hitAllReps?: boolean; rpe?: number; repsCompleted?: string; feedback?: string; sleep?: LoggedSession["sleep"]; soreness?: { muscleGroup: string; severity: number }[] }> = {
  // Week 5 — bench getting harder at an unchanged load. First stall signal.
  "5:bench": { rpe: 9, feedback: "Bench felt way heavier than last week even though it's the same weight. Last two sets were a grind." },
  // Week 6 — bench confirms the stall; squat starts missing reps.
  "6:bench": { rpe: 9, feedback: "Same again on bench. Got the reps but it was ugly." },
  "6:squat": { hitAllReps: false, repsCompleted: "5,5,3", rpe: 9.5, feedback: "Lost the last two reps on set three. Legs had nothing.", soreness: [{ muscleGroup: "quads", severity: 6 }] },
  // Week 7 — squat misses again (two in a row → volume cut), and the key moment:
  // a session that felt brutal but was completed at target RPE.
  "7:squat": { hitAllReps: false, repsCompleted: "5,4,4", rpe: 9.5, feedback: "Second week I haven't finished squats. Feeling beaten up.", soreness: [{ muscleGroup: "quads", severity: 7 }, { muscleGroup: "lower back", severity: 5 }] },
  "7:bench": { rpe: 9, feedback: "Bench is still costing more than it should at this weight." },
  // Missed once and only once. The rule engine must read this as noise, not as
  // a problem — this is the case that stops the app detraining people.
  // Keyed to Thursday only (@3). Row is trained twice a week, so a week-level
  // key applied the same miss to both sessions and the rules correctly — but
  // wrongly for the story — read it as two consecutive misses.
  "7:row@3": { hitAllReps: false, repsCompleted: "8,8,6", rpe: 8.5, feedback: "Dropped a couple of reps on the last set of rows, first time that's happened." },
  // Completed at target RPE and described as brutal. The answer is still to
  // add weight, and saying so is the coaching.
  "7:deadlift": { rpe: 8, feedback: "Absolutely brutal session, thought I was going to have to drop the last set. Genuinely one of the hardest I've done.", sleep: "good" },
};

function buildLoggedWeek(plan: WeeklyPlan, week: number): LoggedSession[] {
  return plan.sessions.map((s, i) => {
    const feedbackParts: string[] = [];
    let sleep: LoggedSession["sleep"] = i % 3 === 0 ? "okay" : "good";
    let soreness: { muscleGroup: string; severity: number }[] = [];

    const lifts = s.mainLifts.map((ml) => {
      const offset = TEMPLATE[i].offset;
      const dev = DEVIATIONS[`${week}:${ml.lift}@${offset}`] ?? DEVIATIONS[`${week}:${ml.lift}`];
      if (dev?.feedback) feedbackParts.push(dev.feedback);
      if (dev?.sleep) sleep = dev.sleep;
      if (dev?.soreness) soreness = dev.soreness;
      return {
        lift: ml.lift,
        setsCompleted: ml.sets,
        setsPrescribed: ml.sets,
        repsCompleted: dev?.repsCompleted ?? ml.reps,
        repsPrescribed: ml.reps,
        weightKg: ml.weightKg ?? 0,
        rpe: dev?.rpe ?? ml.targetRpe,
        hitAllReps: dev?.hitAllReps ?? true,
      };
    });

    return {
      id: `${s.date}-${i}`,
      date: s.date,
      focus: s.focus,
      status: "completed" as const,
      lifts,
      accessoriesCompleted: true,
      feedback: feedbackParts.join(" "),
      // The seeded notes get the same treatment a real one would, so the demo
      // shows extraction working rather than describing it. Keyword pass, not
      // the model: the seed has to be deterministic and free.
      extraction: feedbackParts.length
        ? extractByRules(feedbackParts.join(" "))
        : emptyExtraction(),
      sleep,
      sleepSource: "self_report" as const,
      soreness,
      loggedAt: `${s.date}T19:30:00.000Z`,
    };
  });
}

export function buildSeed(): Database {
  const thisMonday = mondayOf(new Date());
  const sessions: LoggedSession[] = [];
  const planHistory: WeeklyPlan[] = [];

  // Weeks 0-7 are the eight completed weeks before this one.
  for (let week = 0; week < 8; week++) {
    const start = addDays(thisMonday, -7 * (8 - week));
    const plan = buildPlan(start, week);
    planHistory.push(plan);
    sessions.push(...buildLoggedWeek(plan, week));
  }

  // The current week's plan is the output of adapting on week 7.
  const currentPlan = buildPlan(thisMonday, 8);

  // The squat volume cut is applied here, not merely described. A demo whose
  // stated reasoning doesn't match its own numbers is worse than no demo.
  for (const s of currentPlan.sessions) {
    for (const ml of s.mainLifts) {
      if (ml.lift === "squat") ml.sets = 2;
    }
  }

  // Deliberately placed early in the block. If the seed sat on week 4, the very
  // first thing a reviewer clicks would return "deload everything" — technically
  // correct and the least interesting output the system produces.
  currentPlan.blockWeek = 2;

  // Log this week's sessions up to today, leaving anything still ahead of the
  // reviewer unlogged. That gives the demo its flow: log the outstanding
  // session, then generate, and watch the plan respond to what you just typed.
  // At least one is always logged, otherwise adaptation has nothing to act on
  // and the most interesting button does nothing.
  const nowIso = iso(new Date());
  const currentWeekLogs = buildLoggedWeek(currentPlan, 8);
  const past = currentWeekLogs.filter((s) => s.date < nowIso);
  sessions.push(...(past.length > 0 ? past : [currentWeekLogs[0]]));

  currentPlan.summary = "Squat volume reduced, bench and row holding, deadlift progressing";
  currentPlan.adjustments = [
    "Squat volume cut from 3 sets to 2 — reps missed in two consecutive weeks, which is a pattern rather than a bad day. Load unchanged at 100kg.",
    "Bench held at 66.25kg for a third week. RPE climbed from 7.5 to 9 at an unchanged load, so adding weight now would buy a missed session.",
    "Row held. Reps were missed once and only once — one session is noise, so nothing changes until it repeats.",
    "Deadlift progresses to 130kg despite Friday being described as the hardest session yet. Every set was completed at the target RPE of 8, and that is what the right weight feels like.",
  ];
  currentPlan.rationale =
    "Four lifts, four different answers, and only one of them is a reduction. Squat drops a set because reps have now been missed twice running. Bench holds because effort is climbing at a load that isn't. Row holds because one missed set is noise. And the session that felt worst — Friday's deadlift — is the one going up, because it was completed at target RPE. Feeling brutal and being too much are different things.";

  currentPlan.sessions[0].coachingNote =
    "Bench stays at 66.25kg for a third week. You're getting the reps, they're just costing more — hold here until they feel cheaper. Rows hold too; last week's missed set was once, and once is noise. Safety pins on every bench set.";
  currentPlan.sessions[1].coachingNote =
    "Two sets of squats instead of three, at the same 100kg. You've missed reps two weeks running, so this is a volume problem rather than a weight problem.";
  currentPlan.sessions[2].coachingNote =
    "Lighter day by design. Overhead press progresses as normal — it's the one lift that's been moving cleanly the whole block.";
  currentPlan.sessions[3].coachingNote =
    "Up to 130kg. You called last Friday brutal and you were right, but you finished every set at RPE 8 — that's the target, so it goes up. Hard and too heavy aren't the same thing.";

  const lastDecisions: AdaptationDecision[] = [
    { lift: "squat", decision: "reduce_volume", reason: "Reps missed in two consecutive sessions (5,5,3 then 5,4,4 against 5). Two in a row is a pattern, so volume comes down and the load stays." },
    { lift: "bench", decision: "hold", reason: "Work completed, but at RPE 9 against a target of 7.5. Effort climbing at a load that isn't is a stall — adding weight now buys a missed session." },
    { lift: "row", decision: "hold", reason: "Reps missed once (8,8,6 against 8). One session is noise — hold and see whether it repeats." },
    { lift: "overhead_press", decision: "progress", reason: "All sets completed at RPE 7, at or under the target of 7. Progresses per the programme." },
    { lift: "deadlift", decision: "progress", reason: "All sets completed at RPE 8, at or under the target of 8. Progresses per the programme — the session felt brutal, but it was finished at the target." },
  ];

  return {
    intent: INTENT,
    currentPlan,
    planHistory,
    sessions,
    lastDecisions,
    lastSource: "rules",
    music: DEFAULT_MUSIC_PREFS,
    profile: DEFAULT_PROFILE,
    food: buildFood(new Date()),
    weights: buildWeights(new Date()),
    calorieAdjustment: 0,
    nutritionDecisions: [],
  };
}

/* ---------------------------------------------------------------------------
 * What a real new account starts with: nothing.
 *
 * buildSeed() above is kept — eight weeks of scripted history is genuinely
 * useful for demonstrating the product, and throwing it away to make a point
 * would be wasteful. It is just no longer what a person who signs up receives.
 * Handing someone fabricated training history and then adapting their real
 * programme from it is the one thing this app must never do.
 * ------------------------------------------------------------------------- */

/** The programme nobody has described yet. `split: ""` is the "unset" marker. */
export const EMPTY_INTENT: ProgramIntent = {
  daysPerWeek: 4,
  split: "",
  goal: "",
  progressionRule:
    "Double progression. When every set hits the top of the rep range at or below target RPE, add the smallest plate pair. Never add weight on a schedule.",
  notes: "",
  inDeficit: false,
};

/** A week with no sessions in it, so the shape is valid before a plan exists. */
export function emptyPlan(from = new Date()): WeeklyPlan {
  const start = mondayOf(from);
  return {
    weekStart: iso(start),
    weekEnd: iso(addDays(start, 6)),
    blockWeek: 1,
    summary: "No plan yet",
    sessions: [],
    adjustments: [],
    rationale: "",
  };
}

export function emptyDatabase(profile = BLANK_PROFILE): Database {
  return {
    intent: EMPTY_INTENT,
    currentPlan: emptyPlan(),
    planHistory: [],
    sessions: [],
    lastDecisions: [],
    lastSource: null,
    music: DEFAULT_MUSIC_PREFS,
    profile,
    food: [],
    weights: [],
    calorieAdjustment: 0,
    nutritionDecisions: [],
  };
}

/**
 * Whether the app still needs to be told what the person is training.
 * Checked before a week can be generated — adapting a programme nobody has
 * described means inventing one and calling it theirs.
 */
export function needsProgrammeSetup(db: Database): boolean {
  return !db.intent.split.trim() || db.currentPlan.sessions.length === 0;
}
