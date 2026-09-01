import fs from "node:fs";
import path from "node:path";
import { emptyDatabase } from "../seed";
import {
  BLANK_PROFILE,
  DEFAULT_MUSIC_PREFS,
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
import type { AccountRecord, SessionUserRecord, Store } from "./types";

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
    // A new account starts empty. buildSeed() still exists for the demo
    // script; it is not what a person who signs up receives.
    const fresh = emptyDatabase();
    fs.writeFileSync(file, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Database;
    parsed.food ??= [];
    parsed.weights ??= [];
    parsed.calorieAdjustment ??= 0;
    parsed.nutritionDecisions ??= [];
    parsed.music = { ...DEFAULT_MUSIC_PREFS, ...(parsed.music ?? {}) };
    parsed.profile = { ...BLANK_PROFILE, ...(parsed.profile ?? {}) };
    return parsed;
  } catch {
    const fresh = emptyDatabase();
    fs.writeFileSync(file, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

function save(userId: string, db: Database) {
  ensureDir();
  fs.writeFileSync(fileFor(userId), JSON.stringify(db, null, 2));
}

/* ---------------------------------------------------------------------------
 * Accounts and sessions live in one file rather than one per user, because
 * looking someone up by email is the first thing a sign-in has to do and
 * scanning a directory to do it would be silly.
 *
 * A JSON file is not a database: two simultaneous sign-ups can interleave a
 * read and a write and lose one. That is acceptable here precisely because
 * this path is the single-developer, no-setup one — anything with real
 * concurrent users has DATABASE_URL set and is on Postgres.
 * ------------------------------------------------------------------------- */

interface AccountsFile {
  accounts: Record<string, AccountRecord>;
  sessions: Record<string, { userId: string; expiresAt: string }>;
}

const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");

function loadAccounts(): AccountsFile {
  ensureDir();
  if (!fs.existsSync(ACCOUNTS_FILE)) return { accounts: {}, sessions: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8")) as Partial<AccountsFile>;
    return { accounts: parsed.accounts ?? {}, sessions: parsed.sessions ?? {} };
  } catch {
    return { accounts: {}, sessions: {} };
  }
}

function saveAccounts(data: AccountsFile) {
  ensureDir();
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2));
}

const emailKey = (email: string) => email.trim().toLowerCase();

export const jsonStore: Store = {
  async ensureUser(user: SessionUserRecord) {
    const db = load(user.id);
    // Keep the profile in step with the signed-in identity on first touch.
    if (db.profile.email !== user.email) {
      db.profile = { ...db.profile, name: user.name, email: user.email };
      save(user.id, db);
    }
  },

  async findAccount(email) {
    return loadAccounts().accounts[emailKey(email)] ?? null;
  },

  async createAccount(account: AccountRecord) {
    const data = loadAccounts();
    data.accounts[emailKey(account.email)] = account;
    saveAccounts(data);
  },

  async createAuthSession(tokenHash, userId, expiresAt) {
    const data = loadAccounts();
    // Expired rows are cleared on write rather than by a scheduled job. There
    // is no scheduler on this path, and an unbounded sessions map is a leak.
    const now = Date.now();
    for (const [hash, row] of Object.entries(data.sessions)) {
      if (new Date(row.expiresAt).getTime() <= now) delete data.sessions[hash];
    }
    data.sessions[tokenHash] = { userId, expiresAt: expiresAt.toISOString() };
    saveAccounts(data);
  },

  async readAuthSession(tokenHash) {
    const data = loadAccounts();
    const row = data.sessions[tokenHash];
    if (!row) return null;
    if (new Date(row.expiresAt).getTime() <= Date.now()) return null;

    const account = Object.values(data.accounts).find((a) => a.id === row.userId);
    if (!account) return null;
    return { id: account.id, email: account.email, name: account.name };
  },

  async deleteAuthSession(tokenHash) {
    const data = loadAccounts();
    delete data.sessions[tokenHash];
    saveAccounts(data);
  },

  /**
   * Accounts and sessions live in the shared file (see above), so this has to
   * find its own account and drop it, plus every session issued for it — one
   * row keyed by userId, unlike Postgres, doesn't clean up on its own. The
   * per-user data file is the rest of what a real account owns.
   */
  async deleteAccount(userId) {
    const data = loadAccounts();
    const emailKey = Object.entries(data.accounts).find(([, a]) => a.id === userId)?.[0];
    if (emailKey) delete data.accounts[emailKey];
    for (const [hash, row] of Object.entries(data.sessions)) {
      if (row.userId === userId) delete data.sessions[hash];
    }
    saveAccounts(data);

    const file = fileFor(userId);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  },

  async read(userId) {
    return load(userId);
  },

  /** Profile and music survive: they are settings, not history. Same as the pg path. */
  async reset(userId) {
    const before = load(userId);
    const fresh = emptyDatabase(before.profile);
    fresh.music = before.music;
    save(userId, fresh);
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

  async saveIntent(userId, intent) {
    const db = load(userId);
    db.intent = intent;
    save(userId, db);
    return intent;
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
