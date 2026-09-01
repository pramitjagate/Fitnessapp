import { boolean, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type {
  Accessory,
  AdaptationDecision,
  LoggedLift,
  NoteExtraction,
  NutritionDecision,
  PrescribedLift,
  WeeklyPlan,
} from "../types";

/* ---------------------------------------------------------------------------
 * Where the line between column and jsonb falls, and why.
 *
 * Columns for anything queried, filtered, aggregated or joined: dates, loads,
 * calories, weights. jsonb for things always read whole and never queried by
 * their internals — a plan's prescribed lifts, a decision's evidence list.
 *
 * Fully normalising a prescribed lift would mean a sets table, a reps table and
 * three joins to render one card, for zero queries anyone will ever write.
 * Storing a logged session as one blob would mean no "average RPE by week"
 * without reading every row into JS. Both extremes are wrong; this is the seam
 * between them.
 * ------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    /**
     * scrypt$salt$hash. Nullable because rows written before real sign-up
     * existed have no password — those accounts can be claimed by signing up
     * with the same address, which is why user ids are derived from the email
     * rather than generated.
     */
    passwordHash: text("password_hash"),
    /** Set once demo history has been written for this user. Off by default now. */
    seededAt: timestamp("seeded_at"),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)]
);

/**
 * Live sessions, one row per sign-in.
 *
 * The row's key is the SHA-256 of the token, never the token — a dump of this
 * table is useless to whoever reads it, because the value the browser sends
 * cannot be recovered from its hash.
 *
 * A server-side table rather than a self-contained signed cookie (a JWT) is
 * the deliberate choice: it means sign-out actually ends the session, and a
 * compromised account can be cut off now rather than when the token expires.
 * The cost is a database read per request, which for one user is nothing.
 */
export const authSessions = pgTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  units: text("units").notNull(),
  bodyweightKg: real("bodyweight_kg"),
  heightCm: real("height_cm"),
  age: integer("age"),
  sex: text("sex").notNull(),
  activity: text("activity").notNull(),
  nutritionGoal: text("nutrition_goal").notNull(),
  trainingSince: text("training_since").notNull(),
  gymNotes: text("gym_notes").notNull(),
});

export const programIntent = pgTable("program_intent", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  daysPerWeek: integer("days_per_week").notNull(),
  split: text("split").notNull(),
  goal: text("goal").notNull(),
  progressionRule: text("progression_rule").notNull(),
  notes: text("notes").notNull(),
  inDeficit: boolean("in_deficit").notNull(),
});

export const musicPrefs = pgTable("music_prefs", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  genres: jsonb("genres").$type<string[]>().notNull(),
  favouriteArtists: jsonb("favourite_artists").$type<string[]>().notNull(),
  avoidArtists: jsonb("avoid_artists").$type<string[]>().notNull(),
  explicit: boolean("explicit").notNull(),
  familiarity: text("familiarity").notNull(),
  followArc: boolean("follow_arc").notNull(),
  warmupMinutes: integer("warmup_minutes").notNull(),
  cardioMinutes: integer("cardio_minutes").notNull(),
  calmerOnTechniqueDays: boolean("calmer_on_technique_days").notNull(),
  spotifyConnected: boolean("spotify_connected").notNull(),
});

/**
 * Plans are archived rather than overwritten, so the history of adjustments
 * stays inspectable. `isCurrent` marks the live one — a partial unique index
 * would enforce one per user, which is worth adding the day this has real users.
 */
export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  weekStart: text("week_start").notNull(),
  blockWeek: integer("block_week").notNull(),
  isCurrent: boolean("is_current").notNull().default(false),
  plan: jsonb("plan").$type<WeeklyPlan>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    focus: text("focus").notNull(),
    status: text("status").notNull(),
    accessoriesCompleted: boolean("accessories_completed").notNull(),
    feedback: text("feedback").notNull(),
    extraction: jsonb("extraction").$type<NoteExtraction | null>(),
    sleep: text("sleep"),
    sleepSource: text("sleep_source"),
    lifts: jsonb("lifts").$type<LoggedLift[]>().notNull(),
    soreness: jsonb("soreness").$type<{ muscleGroup: string; severity: number }[]>().notNull(),
    loggedAt: text("logged_at").notNull(),
  },
  (t) => [uniqueIndex("sessions_user_date_idx").on(t.userId, t.date)]
);

export const foodEntries = pgTable("food_entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  label: text("label").notNull(),
  kcal: real("kcal").notNull(),
  protein: real("protein").notNull(),
  carbs: real("carbs").notNull(),
  fat: real("fat").notNull(),
  source: text("source").notNull(),
});

export const weights = pgTable(
  "weights",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    kg: real("kg").notNull(),
  },
  // One reading per day: a second weigh-in on the same morning replaces it.
  (t) => [uniqueIndex("weights_user_date_idx").on(t.userId, t.date)]
);

export const adaptationState = pgTable("adaptation_state", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  lastDecisions: jsonb("last_decisions").$type<AdaptationDecision[]>().notNull(),
  lastSource: text("last_source"),
  calorieAdjustment: integer("calorie_adjustment").notNull().default(0),
  nutritionDecisions: jsonb("nutrition_decisions").$type<NutritionDecision[]>().notNull(),
});

export type PlanRow = typeof plans.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type { Accessory, PrescribedLift };
