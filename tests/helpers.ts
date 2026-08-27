import type { LiftEvidence } from "@/lib/adapt";
import { DEFAULT_PROFILE, type Profile } from "@/lib/types";

/**
 * Builders, not fixtures.
 *
 * Every test states only the fields it is actually about — a test that spells
 * out fifteen irrelevant properties hides which one it depends on, and the next
 * person to change the schema has no idea which tests care.
 */
export function evidence(over: Partial<LiftEvidence> = {}): LiftEvidence {
  return {
    lift: "squat",
    currentLoadKg: 100,
    targetRpe: 7.5,
    setsPrescribed: 3,
    loggedThisWeek: true,
    history: [],
    ...over,
  };
}

type Session = LiftEvidence["history"][number];

export function session(over: Partial<Session> = {}): Session {
  return {
    date: "2026-08-24",
    weightKg: 100,
    rpe: 7.5,
    hitAllReps: true,
    repsCompleted: "5,5,5",
    repsPrescribed: "5",
    sleep: "good",
    feedback: "",
    ...over,
  };
}

export function profile(over: Partial<Profile> = {}): Profile {
  return { ...DEFAULT_PROFILE, ...over };
}
