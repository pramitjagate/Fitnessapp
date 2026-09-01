/*
 * Logs the sessions actually trained this week.
 *
 *   npm run log-week -- you@example.com
 *
 * Weights are entered here in POUNDS, exactly as they were done in the gym,
 * and converted once on the way in. Every load in the database is kilograms;
 * the profile's `units` decides what the app shows you.
 *
 * `setWeightsKg` keeps the whole ramp. `weightKg` is the top set, because that
 * is what the charts plot and the adaptation reads — the number that answers
 * "is this moving?".
 */
import { displayToKg } from "../lib/units";
import { extractNote } from "../lib/extract";
import { userIdFor } from "../lib/auth";
import { store } from "../lib/store";
import type { LoggedSession } from "../lib/types";

type Entry = {
  date: string;
  focus: string;
  lift: LoggedSession["lifts"][number]["lift"];
  setsPrescribed: number;
  repsPrescribed: string;
  /** As lifted, in pounds, in order. */
  lb: number[];
  repsCompleted: string;
  hitAllReps: boolean;
  rpe: number | null;
  sleep: LoggedSession["sleep"];
  feedback: string;
};

const WEEK: Entry[] = [
  {
    date: "2026-08-24", focus: "Chest and triceps", lift: "bench",
    setsPrescribed: 3, repsPrescribed: "10", lb: [55, 60, 65],
    repsCompleted: "10,10,10", hitAllReps: true, rpe: null, sleep: null, feedback: "",
  },
  {
    date: "2026-08-25", focus: "Back and biceps", lift: "row",
    setsPrescribed: 3, repsPrescribed: "8-10", lb: [40, 45, 50],
    repsCompleted: "10,10,10", hitAllReps: true, rpe: null, sleep: null, feedback: "",
  },
  {
    date: "2026-08-26", focus: "Legs", lift: "squat",
    setsPrescribed: 3, repsPrescribed: "6-8", lb: [100, 110, 120],
    repsCompleted: "8,8,8", hitAllReps: true, rpe: null, sleep: null, feedback: "",
  },
  {
    date: "2026-08-27", focus: "Shoulders", lift: "overhead_press",
    setsPrescribed: 3, repsPrescribed: "8-10", lb: [50, 55, 60],
    repsCompleted: "10,10,10", hitAllReps: true, rpe: null, sleep: null, feedback: "",
  },
];

const email = process.argv[2];
if (!email) {
  console.error("Usage: log-week.ts <email>");
  process.exit(1);
}

const userId = userIdFor(email);
await store.ensureUser({ id: userId, email, name: email.split("@")[0] });

// Training happens in pounds, so the app should show pounds. Loads are still
// stored in kilos underneath.
const profile = await store.readProfile(userId);
if (profile.units !== "lb") {
  await store.saveProfile(userId, { ...profile, units: "lb" });
  console.log("Set your display units to pounds.\n");
}

for (const e of WEEK) {
  const setWeightsKg = e.lb.map((v) => displayToKg(v, "lb"));
  const topSet = Math.max(...setWeightsKg);

  await store.saveSession(userId, {
    id: `${e.date}-logged`,
    date: e.date,
    focus: e.focus,
    status: "completed",
    lifts: [
      {
        lift: e.lift,
        setsCompleted: e.lb.length,
        setsPrescribed: e.setsPrescribed,
        repsCompleted: e.repsCompleted,
        repsPrescribed: e.repsPrescribed,
        weightKg: topSet,
        setWeightsKg,
        rpe: e.rpe,
        hitAllReps: e.hitAllReps,
      },
    ],
    accessoriesCompleted: true,
    feedback: e.feedback,
    extraction: await extractNote(e.feedback),
    sleep: e.sleep,
    sleepSource: e.sleep ? "self_report" : null,
    soreness: [],
    loggedAt: new Date().toISOString(),
  });

  console.log(
    `${e.date}  ${e.focus.padEnd(20)} ${e.lift.padEnd(15)} ${e.lb.join("/")}lb  ->  top set ${topSet}kg`,
  );
}

console.log(`\nLogged ${WEEK.length} sessions for ${email}.`);
console.log("Friday's deadlift is still to come — log it in the app when you've done it.");
