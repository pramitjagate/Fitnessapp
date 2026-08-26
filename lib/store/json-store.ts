import fs from "node:fs";
import path from "node:path";
import { buildSeed } from "../seed";
import {
  DEFAULT_MUSIC_PREFS,
  DEFAULT_PROFILE,
  type AdaptationDecision,
  type Database,
  type FoodEntry,
  type LoggedSession,
  type MusicPrefs,
  type NutritionDecision,
  type Profile,
  type WeeklyPlan,
  type WeightEntry,
} from "../types";
import type { SessionUserRecord, Store } from "./types";

/* ---------------------------------------------------------------------------
 * The zero-setup path. Used whenever DATABASE_URL is absent — clone, npm run
 * dev, and the app works with no database to install and no migrations to run.
 *
 * That property is worth keeping. A prototype a reviewer can't start in thirty
 * seconds is a prototype a reviewer doesn't start, and the Postgres path is
 * only needed once it's deployed. One file per user, so the multi-user
 * behaviour is identical on both paths rather than "works on the server".
 * ------------------------------------------------------------------------- */

const DATA_DIR = path.join(process.cwd(), "data");

function fileFor(userId: string): string {
  // Ids come from a hash, but a path built from user input gets sanitised
  // whatever its provenance — the day one comes from a form is the day it isn't.
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(DATA_DIR, `user-${safe}.json`);
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load(userId: string): Database {
  ensureDir();
  const file = fileFor(userId);
  if (!fs.existsSync(file)) {
    const seeded = buildSeed();
    fs.writeFileSync(file, JSON.stringify(seeded, null, 2));
    return seeded;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Database;
    parsed.food ??= [];
    parsed.weights ??= [];
    parsed.calorieAdjustment ??= 0;
    parsed.nutritionDecisions ??= [];
    parsed.music = { ...DEFAULT_MUSIC_PREFS, ...(parsed.music ?? {}) };
    parsed.profile = { ...DEFAULT_PROFILE, ...(parsed.profile ?? {}) };
    return parsed;
  } catch {
    const seeded = buildSeed();
    fs.writeFileSync(file, JSON.stringify(seeded, null, 2));
    return seeded;
  }
}

function save(userId: string, db: Database) {
  ensureDir();
  fs.writeFileSync(fileFor(userId), JSON.stringify(db, null, 2));
}

export const jsonStore: Store = {
  async ensureUser(user: SessionUserRecord) {
    const db = load(user.id);
    // Keep the profile in step with the signed-in identity on first touch.
    if (db.profile.email !== user.email) {
      db.profile = { ...db.profile, name: user.name, email: user.email };
      save(user.id, db);
    }
  },

  async read(userId) {
    return load(userId);
  },

  async reset(userId) {
    save(userId, buildSeed());
  },

  async saveSession(userId, session: LoggedSession) {
    const db = load(userId);
    const i = db.sessions.findIndex((s) => s.date === session.date);
    if (i >= 0) db.sessions[i] = session;
    else db.sessions.push(session);
    db.sessions.sort((a, b) => a.date.localeCompare(b.date));
    save(userId, db);
  },

  async savePlan(
    userId,
    plan: WeeklyPlan,
    decisions: AdaptationDecision[],
    source: "model" | "rules"
  ) {
    const db = load(userId);
    db.planHistory.push(db.currentPlan);
    db.currentPlan = plan;
    db.lastDecisions = decisions;
    db.lastSource = source;
    save(userId, db);
  },

  async readProfile(userId) {
    return load(userId).profile;
  },

  async saveProfile(userId, profile: Profile) {
    const db = load(userId);
    db.profile = profile;
    save(userId, db);
    return profile;
  },

  async readMusicPrefs(userId) {
    return load(userId).music;
  },

  async saveMusicPrefs(userId, prefs: MusicPrefs) {
    const db = load(userId);
    db.music = prefs;
    save(userId, db);
    return prefs;
  },

  async addFood(userId, entry: FoodEntry) {
    const db = load(userId);
    db.food.push(entry);
    save(userId, db);
  },

  async removeFood(userId, id: string) {
    const db = load(userId);
    db.food = db.food.filter((f) => f.id !== id);
    save(userId, db);
  },

  async saveWeight(userId, entry: WeightEntry) {
    const db = load(userId);
    const i = db.weights.findIndex((w) => w.date === entry.date);
    if (i >= 0) db.weights[i] = entry;
    else db.weights.push(entry);
    db.weights.sort((a, b) => a.date.localeCompare(b.date));
    save(userId, db);
  },

  async applyNutritionDecision(userId, decision: NutritionDecision) {
    const db = load(userId);
    db.calorieAdjustment += decision.deltaKcal;
    db.nutritionDecisions.push(decision);
    save(userId, db);
  },
};
