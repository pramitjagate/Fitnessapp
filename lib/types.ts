import { z } from "zod";

export const LIFTS = [
  "squat",
  "deadlift",
  "bench",
  "overhead_press",
  "row",
  "other",
] as const;

export const PHASES = [
  "volume",
  "heavy_singles",
  "technique",
  "deload",
  "rest",
] as const;

/**
 * A prescribed barbell lift. `weightKg` is deliberately nullable: on a first
 * week, or for a lift with no logged history, there is no honest number to
 * put here. A null means "establish this session" — an invented 60 looks
 * identical to a real one once it's in a plan.
 */
export const PrescribedLift = z.object({
  lift: z.enum(LIFTS),
  sets: z.number().int().min(1),
  reps: z.string(), // "5", "6-8", "5,3,1"
  weightKg: z.number().nullable(),
  targetRpe: z.number().min(1).max(10),
  loadNote: z.string().optional(),
});
export type PrescribedLift = z.infer<typeof PrescribedLift>;

export const Accessory = z.object({
  exercise: z.string(),
  sets: z.number().int().min(1),
  reps: z.string(),
  notes: z.string().optional(),
});
export type Accessory = z.infer<typeof Accessory>;

export const PlannedSession = z.object({
  day: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  focus: z.string(),
  phase: z.enum(PHASES),
  mainLifts: z.array(PrescribedLift),
  accessories: z.array(Accessory),
  coachingNote: z.string(),
});
export type PlannedSession = z.infer<typeof PlannedSession>;

export const WeeklyPlan = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  blockWeek: z.number().int().min(1),
  summary: z.string(),
  sessions: z.array(PlannedSession),
  adjustments: z.array(z.string()),
  rationale: z.string(),
});
export type WeeklyPlan = z.infer<typeof WeeklyPlan>;

/** What the lifter actually did against one prescribed lift. */
export const LoggedLift = z.object({
  lift: z.enum(LIFTS),
  setsCompleted: z.number().int().min(0),
  setsPrescribed: z.number().int().min(0),
  repsCompleted: z.string(),
  repsPrescribed: z.string(),
  /** The working set — the top set when the lifter ramps. */
  weightKg: z.number(),
  /**
   * Every set's load, when they were not all the same.
   *
   * Ramping (55, 60, 65) is how most people actually lift, and the schema
   * originally had one number per lift because the seeded demo used straight
   * sets. `weightKg` stays the top set so charts and adaptation keep working;
   * this preserves what was really done rather than discarding two thirds of it.
   */
  setWeightsKg: z.array(z.number()).optional(),
  rpe: z.number().min(1).max(10).nullable(),
  /**
   * The single most valuable field in the system. Perception explains a
   * session; whether the work was completed is what anchors it.
   */
  hitAllReps: z.boolean(),
});
export type LoggedLift = z.infer<typeof LoggedLift>;

export const Sleep = z.enum(["poor", "okay", "good"]);
export type Sleep = z.infer<typeof Sleep>;

/**
 * What a free-text note actually said, in fields the rest of the system can
 * read. Derived from `feedback`, stored beside it, never replacing it.
 */
export const NoteExtraction = z.object({
  lift: z.enum(LIFTS).nullable(),
  signal: z.enum(["fatigue", "pain", "technique", "life", "positive", "none"]),
  severity: z.enum(["low", "moderate", "high"]),
  scope: z.enum(["lift", "session"]),
  /**
   * The field with consequences. True caps the week's decision at hold, so a
   * false negative here is the expensive direction: erring toward true costs a
   * week of unchanged load, erring toward false adds weight to something that
   * hurts.
   */
  mentionsPain: z.boolean(),
  /** The lifter's own words that drove the reading — never a paraphrase. */
  quote: z.string(),
  source: z.enum(["model", "rules"]),
});
export type NoteExtraction = z.infer<typeof NoteExtraction>;

export const LoggedSession = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  focus: z.string(),
  status: z.enum(["completed", "skipped"]),
  lifts: z.array(LoggedLift),
  accessoriesCompleted: z.boolean(),
  /** Free text, stored verbatim. Never summarised on the way in. */
  feedback: z.string(),
  /** Structure derived from `feedback` at log time. Null for older sessions. */
  extraction: NoteExtraction.nullable().optional(),
  sleep: Sleep.nullable(),
  sleepSource: z.enum(["self_report", "wearable"]).nullable(),
  soreness: z.array(z.object({ muscleGroup: z.string(), severity: z.number().min(1).max(10) })),
  loggedAt: z.string(),
});
export type LoggedSession = z.infer<typeof LoggedSession>;

export const ProgramIntent = z.object({
  daysPerWeek: z.number().int().min(1).max(7),
  split: z.string(),
  goal: z.string(),
  progressionRule: z.string(),
  notes: z.string(),
  /** Deficit changes what "success" means: holding load is a win, not a stall. */
  inDeficit: z.boolean(),
});
export type ProgramIntent = z.infer<typeof ProgramIntent>;

export const AdaptationDecision = z.object({
  lift: z.string(),
  decision: z.enum(["progress", "hold", "reduce_load", "reduce_volume", "deload"]),
  reason: z.string(),
});
export type AdaptationDecision = z.infer<typeof AdaptationDecision>;

export const AdaptationResult = z.object({
  plan: WeeklyPlan,
  decisions: z.array(AdaptationDecision),
  /** "model" when the Anthropic API produced it, "rules" for the fallback. */
  source: z.enum(["model", "rules"]),
  note: z.string().optional(),
});
export type AdaptationResult = z.infer<typeof AdaptationResult>;

export const GENRES = [
  "EDM & house",
  "Dubstep",
  "Trap",
  "Hip-hop & rap",
  "Drum & bass",
  "Metal & hard rock",
  "Punk",
  "Punjabi & desi hip-hop",
  "Bollywood",
  "Afrobeats",
  "Pop",
  "Rock",
] as const;

export const MusicPrefs = z.object({
  genres: z.array(z.string()),
  favouriteArtists: z.array(z.string()),
  avoidArtists: z.array(z.string()),
  explicit: z.boolean(),
  /** How much of the playlist should be music you already know. */
  familiarity: z.enum(["known", "mixed", "discovery"]),
  /**
   * Whether the playlist follows the session's energy arc or holds one level.
   * The arc is the interesting bit; holding steady is the simpler fallback.
   */
  followArc: z.boolean(),
  warmupMinutes: z.number().int().min(0).max(30),
  cardioMinutes: z.number().int().min(0).max(60),
  /** Lighter, less lyric-heavy music on technique days. */
  calmerOnTechniqueDays: z.boolean(),
  spotifyConnected: z.boolean(),
});
export type MusicPrefs = z.infer<typeof MusicPrefs>;

export const DEFAULT_MUSIC_PREFS: MusicPrefs = {
  genres: ["EDM & house", "Dubstep", "Trap", "Hip-hop & rap"],
  favouriteArtists: [],
  avoidArtists: [],
  explicit: true,
  familiarity: "mixed",
  followArc: true,
  warmupMinutes: 10,
  cardioMinutes: 22,
  calmerOnTechniqueDays: true,
  spotifyConnected: false,
};

/**
 * Activity *outside* training. Sessions are counted separately from the logged
 * plan, so "4 gym days" isn't paid for twice.
 */
export const ACTIVITY = ["sedentary", "light", "moderate", "active"] as const;
export const NUTRITION_GOALS = ["cut", "recomp", "gain"] as const;

export const Profile = z.object({
  name: z.string().max(60),
  email: z.string().email(),
  /**
   * Display only. Loads are stored in kg throughout — converting the stored
   * unit is how a training log ends up with 102.05kg on the bar.
   */
  units: z.enum(["kg", "lb"]),
  bodyweightKg: z.number().min(20).max(300).nullable(),
  heightCm: z.number().min(120).max(230).nullable(),
  age: z.number().int().min(14).max(100).nullable(),
  /**
   * Biological sex, because the Mifflin-St Jeor equation takes a fixed offset
   * for it. "unspecified" averages the two rather than refusing to answer —
   * the estimate is a starting point either way.
   */
  sex: z.enum(["male", "female", "unspecified"]),
  activity: z.enum(ACTIVITY),
  nutritionGoal: z.enum(NUTRITION_GOALS),
  trainingSince: z.string(),
  gymNotes: z.string().max(500),
});
export type Profile = z.infer<typeof Profile>;

export const DEFAULT_PROFILE: Profile = {
  name: "Demo Lifter",
  email: "demo@secondweek.app",
  units: "kg",
  bodyweightKg: 78,
  heightCm: 178,
  age: 27,
  sex: "male",
  activity: "light",
  nutritionGoal: "cut",
  trainingSince: "2024",
  gymNotes: "Trains alone. Safety pins on every squat and bench set.",
};

/**
 * What a real new account's profile starts as — nothing invented.
 *
 * Same "unset" pattern as EMPTY_INTENT in lib/seed.ts: the numeric fields are
 * null rather than a plausible-looking number nobody entered. A stranger's
 * bodyweight quietly seeded onto a new account is worse than a blank one,
 * because it looks like data instead of a placeholder — macroTargets() in
 * lib/nutrition.ts already treats null as "ask, don't guess."
 */
export const BLANK_PROFILE: Profile = {
  name: "",
  email: "",
  units: "kg",
  bodyweightKg: null,
  heightCm: null,
  age: null,
  sex: "unspecified",
  activity: "light",
  nutritionGoal: "recomp",
  trainingSince: "",
  gymNotes: "",
};

/**
 * One thing eaten. Macros are stored per entry rather than referencing a
 * recipe, so editing the recipe library later can't rewrite what someone ate
 * last month. A log is a record, not a view.
 */
export const FoodEntry = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(1).max(80),
  kcal: z.number().min(0).max(5000),
  protein: z.number().min(0).max(400),
  carbs: z.number().min(0).max(800),
  fat: z.number().min(0).max(400),
  source: z.enum(["recipe", "custom"]),
});
export type FoodEntry = z.infer<typeof FoodEntry>;

export const WeightEntry = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kg: z.number().min(20).max(300),
});
export type WeightEntry = z.infer<typeof WeightEntry>;

export const NutritionDecision = z.object({
  decision: z.enum(["hold", "raise", "lower", "insufficient_evidence", "adherence_first"]),
  deltaKcal: z.number(),
  reason: z.string(),
  /** What the decision was made from, shown to the user unedited. */
  evidence: z.array(z.string()),
  decidedOn: z.string(),
});
export type NutritionDecision = z.infer<typeof NutritionDecision>;

export interface Database {
  intent: ProgramIntent;
  currentPlan: WeeklyPlan;
  planHistory: WeeklyPlan[];
  sessions: LoggedSession[];
  lastDecisions: AdaptationDecision[];
  lastSource: "model" | "rules" | null;
  music: MusicPrefs;
  profile: Profile;
  food: FoodEntry[];
  weights: WeightEntry[];
  /**
   * The loop's output: kcal added to (or taken off) the computed target. Kept
   * separate from the estimate rather than overwriting it, so you can always
   * see the equation's answer next to what reality argued for.
   */
  calorieAdjustment: number;
  nutritionDecisions: NutritionDecision[];
}
