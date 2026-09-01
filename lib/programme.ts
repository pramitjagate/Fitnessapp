import { addDays, dayName, iso } from "./dates";
import type { PlannedSession, PrescribedLift, ProgramIntent, WeeklyPlan } from "./types";

/* ---------------------------------------------------------------------------
 * The first week.
 *
 * A brand new account has no logged history, so there is nothing to adapt from
 * and nothing to progress. What it can be given is a SHAPE: which days you
 * train, what each day is for, and which barbell lift anchors it. That is
 * enough for the log to start collecting the evidence the adaptation loop needs
 * from week two onwards — which is where the name came from.
 *
 * Every weightKg here is null, without exception. The app has never seen this
 * person lift. A number would be a guess wearing a prescription's clothes.
 * ------------------------------------------------------------------------- */

export const SPLITS = [
  {
    key: "full_body",
    label: "Full body",
    blurb: "Every session hits the whole body. The best default for 2-3 days a week.",
    /** The rotation each training day steps through. */
    days: [
      { focus: "Full body — squat focus", lifts: ["squat", "bench", "row"] },
      { focus: "Full body — hinge focus", lifts: ["deadlift", "overhead_press", "row"] },
      { focus: "Full body — press focus", lifts: ["bench", "squat", "row"] },
    ],
  },
  {
    key: "upper_lower",
    label: "Upper / lower",
    blurb: "Alternating upper and lower days. The standard four-day split.",
    days: [
      { focus: "Upper", lifts: ["bench", "row"] },
      { focus: "Lower", lifts: ["squat"] },
      { focus: "Upper", lifts: ["overhead_press", "row"] },
      { focus: "Lower", lifts: ["deadlift"] },
    ],
  },
  {
    key: "push_pull_legs",
    label: "Push / pull / legs",
    blurb: "Pressing, pulling and legs on separate days. Six days if you run it twice.",
    days: [
      { focus: "Push", lifts: ["bench", "overhead_press"] },
      { focus: "Pull", lifts: ["row", "deadlift"] },
      { focus: "Legs", lifts: ["squat"] },
    ],
  },
  {
    key: "body_part",
    label: "Body part split",
    blurb: "Chest, back, legs, shoulders, arms — one region a day. Five days.",
    days: [
      { focus: "Chest", lifts: ["bench"] },
      { focus: "Back", lifts: ["row"] },
      { focus: "Legs", lifts: ["squat"] },
      { focus: "Shoulders", lifts: ["overhead_press"] },
      { focus: "Deadlift and arms", lifts: ["deadlift"] },
    ],
  },
  {
    key: "custom",
    label: "Something else",
    blurb: "Your own programme. The week is created empty and you fill it in.",
    days: [],
  },
] as const;

export type SplitKey = (typeof SPLITS)[number]["key"];

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export function splitFor(key: SplitKey) {
  return SPLITS.find((s) => s.key === key) ?? SPLITS[0];
}

function starterLift(lift: string, index: number): PrescribedLift {
  return {
    lift: lift as PrescribedLift["lift"],
    sets: 3,
    // 5s on the anchor lift, 8-10 on what follows it. Not a periodisation
    // scheme — a defensible starting point that the loop replaces from week two.
    reps: index === 0 ? "5" : "8-10",
    weightKg: null,
    targetRpe: 7,
    loadNote: "First week — find a weight you could have done two more reps with.",
  };
}

/**
 * Build the opening week from the questionnaire's answers.
 *
 * `trainingDays` is the weekday names the person picked. Rest days are simply
 * the ones they didn't — asking for both invites them to disagree with each
 * other, and then something has to decide which answer wins.
 */
export function buildStarterPlan(
  splitKey: SplitKey,
  trainingDays: string[],
  weekStart: Date
): WeeklyPlan {
  const split = splitFor(splitKey);
  const ordered = WEEKDAYS.filter((d) => trainingDays.includes(d));

  const sessions: PlannedSession[] = ordered.map((day, i) => {
    const date = iso(addDays(weekStart, WEEKDAYS.indexOf(day)));
    // The rotation wraps, so five training days on a three-day split runs
    // the first two days again rather than dropping the extra sessions.
    const template = split.days.length ? split.days[i % split.days.length] : null;

    return {
      day: dayName(date),
      date,
      focus: template?.focus ?? "Training",
      phase: "technique" as const,
      mainLifts: template ? template.lifts.map((l, j) => starterLift(l, j)) : [],
      accessories: [],
      coachingNote: template
        ? "Nothing is prescribed by load this week because nothing has been logged yet. Pick weights by feel, leave two reps in the tank, and next week is built from what actually happened."
        : "Your own programme — add the exercises you're doing on this day.",
    };
  });

  return {
    weekStart: iso(weekStart),
    weekEnd: iso(addDays(weekStart, 6)),
    blockWeek: 1,
    summary: `${split.label} · ${ordered.length} ${ordered.length === 1 ? "day" : "days"} a week`,
    sessions,
    adjustments: [],
    rationale:
      "Week one. Nothing has been adapted because nothing has been logged — this is the shape you described, with the loads left for you to find. The coaching starts next week.",
  };
}

/** The programme description the adaptation engine reads, from the same answers. */
export function intentFrom(
  base: ProgramIntent,
  splitKey: SplitKey,
  trainingDays: string[],
  goal: string,
  inDeficit: boolean
): ProgramIntent {
  const split = splitFor(splitKey);
  const rest = WEEKDAYS.filter((d) => !trainingDays.includes(d));

  return {
    ...base,
    daysPerWeek: Math.max(1, trainingDays.length),
    split: `${split.label} — training ${trainingDays.join(", ")}${
      rest.length ? `; resting ${rest.join(", ")}` : ""
    }`,
    goal: goal || base.goal,
    inDeficit,
  };
}
