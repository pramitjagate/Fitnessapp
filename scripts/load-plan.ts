/*
 * Loads the five-day plan from the PDF as a real programme and week.
 *
 *   npm run load-plan -- you@example.com 2026-08-24
 *
 * A script rather than a one-off insert: loading a programme is something you
 * do again — a new block, a second account, a reset — and a script is the
 * difference between "I did it once somehow" and "run this".
 *
 * Only the five barbell lifts become mainLifts. Everything else is an
 * accessory, because those are what the adaptation loop reads. That is a real
 * limitation of the schema against a body-part split, and worth seeing plainly
 * rather than papering over: 28 of the 33 exercises here are a done/not-done
 * checkbox.
 */
import { addDays, dayName, iso, mondayOf } from "../lib/dates";
import { userIdFor } from "../lib/auth";
import { store } from "../lib/store";
import type { PlannedSession, ProgramIntent, WeeklyPlan } from "../lib/types";

const INTENT: ProgramIntent = {
  daysPerWeek: 5,
  split:
    "Five day body-part split — Monday chest and triceps, Tuesday back and biceps, Wednesday legs, Thursday shoulders, Friday deadlift, arms and core",
  goal: "Build muscle in a small deficit. The first month is about learning the movements, not moving big weight.",
  progressionRule:
    "Double progression. When every set hits the top of the rep range, add a little weight or one more rep next time. Stop 1 to 2 reps short of failure on most sets.",
  notes:
    "Safety pins on every squat and bench set, warm ups included. Five days back to back with no rest day is a lot — if week three feels like dragging and the weights go backwards, that is a recovery problem, not a discipline problem. Treadmill after lifting, never before.",
  inDeficit: true,
};

/** [day offset, focus, phase, main lift, sets, reps, accessories, coaching note] */
const DAYS: [
  number,
  string,
  PlannedSession["phase"],
  PlannedSession["mainLifts"][number]["lift"],
  number,
  string,
  [string, number, string][],
  string,
][] = [
  [
    0, "Chest and triceps", "volume", "bench", 3, "10",
    [
      ["Incline dumbbell press", 3, "10-12"],
      ["Machine or cable chest fly", 3, "10"],
      ["Cable skull crusher", 3, "15-20"],
      ["Rope pushdown", 3, "12-15"],
      ["Cross cable triceps extension", 3, "12-15"],
      ["Assisted dips", 3, "10"],
    ],
    "Safety pins on every barbell bench set. A failed bench with no pins puts the bar on your chest and you are stuck.",
  ],
  [
    1, "Back and biceps", "volume", "row", 3, "8-10",
    [
      ["Pull ups", 3, "6-10"],
      ["Lat pulldown", 3, "10-12"],
      ["One arm cable row", 3, "10-12"],
      ["Close grip bar curl", 3, "8-10"],
      ["Cross body hammer curl", 3, "10-12"],
      ["Bicep machine curl", 3, "12-15"],
    ],
    "Pull ups first while you are fresh. On rows, if your torso comes up toward standing on the last reps, the weight is too heavy.",
  ],
  [
    2, "Legs", "volume", "squat", 3, "6-8",
    [
      ["Romanian deadlift", 3, "8-10"],
      ["Lying leg curl", 3, "12"],
      ["Leg extension", 3, "15"],
      ["Calf raise on leg press", 3, "15-20"],
    ],
    "Safety pins every single set, even warm ups. Dynamic warm up before, static stretch after — do not flip them. This is the hardest session of the week: if something has to go on a bad day, cut the leg extension, not the squat.",
  ],
  [
    3, "Shoulders", "technique", "overhead_press", 3, "8-10",
    [
      ["Rear delt fly", 3, "15"],
      ["Dumbbell lateral raise", 3, "12-15"],
      ["Seated face pull on the floor", 3, "15"],
      ["Dumbbell shrug", 3, "12-15"],
    ],
    "Shoulders are small muscles and almost every mistake here is too much weight. Do not skip the face pulls — least impressive, most useful.",
  ],
  [
    4, "Deadlift, arms and core", "heavy_singles", "deadlift", 3, "5",
    [
      ["Dumbbell curl", 3, "10-12"],
      ["Dips or cable pushdown", 3, "10"],
      ["Kneeling cable crunch", 3, "12-15"],
      ["Hanging knee raise", 3, "10-12"],
    ],
    "Deadlift first while fresh. Three sets of five is a strength dose, not a volume day — do not chase a number. If your back rounds at any point, stop the set and drop the weight.",
  ],
];

function buildWeek(weekStart: Date): WeeklyPlan {
  const sessions: PlannedSession[] = DAYS.map(
    ([offset, focus, phase, lift, sets, reps, accessories, coachingNote]) => {
      const date = iso(addDays(weekStart, offset));
      return {
        day: dayName(date),
        date,
        focus,
        phase,
        mainLifts: [
          {
            lift,
            sets,
            reps,
            // The plan deliberately prescribes no loads — "start every exercise
            // lighter than you think you need". Null is the honest value, and
            // the UI renders it as "find your working weight".
            weightKg: null,
            targetRpe: 8,
            loadNote: "First block — start lighter than you think you need and add from there.",
          },
        ],
        accessories: accessories.map(([exercise, s, r]) => ({ exercise, sets: s, reps: r })),
        coachingNote,
      };
    },
  );

  return {
    weekStart: iso(weekStart),
    weekEnd: iso(addDays(weekStart, 6)),
    blockWeek: 1,
    summary:
      "Week one of the five day split. Learning the movements and finding working weights — nothing here should be a grind.",
    sessions,
    adjustments: [],
    rationale:
      "Loaded from the written plan rather than generated. There is no history to adapt from yet, so nothing has been changed.",
  };
}

const [email, weekArg] = process.argv.slice(2);
if (!email) {
  console.error("Usage: load-plan.ts <email> [YYYY-MM-DD week start]");
  process.exit(1);
}

const weekStart = weekArg ? new Date(`${weekArg}T12:00:00`) : mondayOf(new Date());
const userId = userIdFor(email);

await store.ensureUser({ id: userId, email, name: email.split("@")[0] });
await store.saveIntent(userId, INTENT);

const plan = buildWeek(weekStart);
await store.savePlan(userId, plan, [], "rules");

console.log(`Loaded the five day plan for ${email}`);
console.log(`Week ${plan.weekStart} to ${plan.weekEnd}`);
for (const s of plan.sessions) {
  console.log(
    `  ${s.day.padEnd(10)} ${s.date}  ${s.mainLifts[0].lift.padEnd(15)} ${s.mainLifts[0].sets}x${s.mainLifts[0].reps}  + ${s.accessories.length} accessories`,
  );
}
