import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db } from "../db/client";
import * as t from "../db/schema";
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
 * The deployed path.
 *
 * Every query below carries `eq(table.userId, userId)`. That repetition is the
 * point: there is no shared helper that could be called without a scope, and no
 * query builder that defaults to "all rows". Row-level security in Postgres
 * would be stronger still and is the right next step once there is real data in
 * here — this is the version that fits in one file and can be read in full.
 * ------------------------------------------------------------------------- */

function planId(userId: string, weekStart: string, n: number) {
  return `${userId}:${weekStart}:${n}`;
}

export const pgStore: Store = {
  async ensureUser(user: SessionUserRecord) {
    const d = db();
    const [existing] = await d.select().from(t.users).where(eq(t.users.id, user.id));

    if (!existing) {
      await d
        .insert(t.users)
        .values({ id: user.id, email: user.email, name: user.name })
        .onConflictDoNothing();
    }

    /*
     * A new account gets a profile and nothing else. It used to get eight
     * weeks of scripted history, which was right for a prototype and wrong
     * the moment real people sign up: adapting someone's programme from
     * fabricated sessions is the one failure this app cannot recover from.
     * writeSeed() is kept for the demo script.
     */
    await d
      .insert(t.profiles)
      .values({ userId: user.id, ...BLANK_PROFILE, name: user.name, email: user.email })
      .onConflictDoUpdate({
        target: t.profiles.userId,
        set: { name: user.name, email: user.email },
      });
  },

  async findAccount(email) {
    const d = db();
    const [row] = await d
      .select()
      .from(t.users)
      .where(eq(t.users.email, email.trim().toLowerCase()));
    if (!row) return null;
    return { id: row.id, email: row.email, name: row.name, passwordHash: row.passwordHash };
  },

  async createAccount(account: AccountRecord) {
    const d = db();
    /*
     * A row can already exist for this id: user ids are derived from the email,
     * so anyone whose data was written before sign-up existed is claiming their
     * own rows here. The password is only attached when there isn't one —
     * otherwise "create account" on an existing email would silently reset its
     * password, which is an account takeover with a friendly button on it.
     */
    const [existing] = await d.select().from(t.users).where(eq(t.users.id, account.id));

    if (!existing) {
      await d.insert(t.users).values({
        id: account.id,
        email: account.email,
        name: account.name,
        passwordHash: account.passwordHash,
      });
      return;
    }

    if (existing.passwordHash) throw new Error("That account already has a password.");

    await d
      .update(t.users)
      .set({ name: account.name, passwordHash: account.passwordHash })
      .where(eq(t.users.id, account.id));
  },

  async createAuthSession(tokenHash, userId, expiresAt) {
    const d = db();
    // Clear anything already expired. One cheap delete per sign-in keeps the
    // table from growing without a scheduled job to prune it.
    await d.delete(t.authSessions).where(lte(t.authSessions.expiresAt, new Date()));
    await d.insert(t.authSessions).values({ tokenHash, userId, expiresAt });
  },

  async readAuthSession(tokenHash) {
    const d = db();
    const [row] = await d
      .select({
        id: t.users.id,
        email: t.users.email,
        name: t.users.name,
        expiresAt: t.authSessions.expiresAt,
      })
      .from(t.authSessions)
      .innerJoin(t.users, eq(t.users.id, t.authSessions.userId))
      .where(eq(t.authSessions.tokenHash, tokenHash));

    if (!row) return null;
    // Expiry is checked here as well as pruned on write: a row that outlived
    // its expiry between prunes must not authenticate anybody.
    if (row.expiresAt.getTime() <= Date.now()) return null;
    return { id: row.id, email: row.email, name: row.name };
  },

  async deleteAuthSession(tokenHash) {
    const d = db();
    await d.delete(t.authSessions).where(eq(t.authSessions.tokenHash, tokenHash));
  },

  /**
   * One delete. Every other table references users.id with onDelete: "cascade"
   * (see lib/db/schema.ts), so profile, plans, sessions, food, weights and
   * every live session die with the row rather than needing to be named here
   * one by one and risk missing one as the schema grows.
   */
  async deleteAccount(userId) {
    const d = db();
    await d.delete(t.users).where(eq(t.users.id, userId));
  },

  async read(userId): Promise<Database> {
    const d = db();
    const [intent] = await d
      .select()
      .from(t.programIntent)
      .where(eq(t.programIntent.userId, userId));
    const [profileRow] = await d.select().from(t.profiles).where(eq(t.profiles.userId, userId));
    const [musicRow] = await d.select().from(t.musicPrefs).where(eq(t.musicPrefs.userId, userId));
    const [state] = await d
      .select()
      .from(t.adaptationState)
      .where(eq(t.adaptationState.userId, userId));

    const planRows = await d
      .select()
      .from(t.plans)
      .where(eq(t.plans.userId, userId))
      .orderBy(asc(t.plans.weekStart));
    const sessionRows = await d
      .select()
      .from(t.sessions)
      .where(eq(t.sessions.userId, userId))
      .orderBy(asc(t.sessions.date));
    const foodRows = await d
      .select()
      .from(t.foodEntries)
      .where(eq(t.foodEntries.userId, userId))
      .orderBy(asc(t.foodEntries.date));
    const weightRows = await d
      .select()
      .from(t.weights)
      .where(eq(t.weights.userId, userId))
      .orderBy(asc(t.weights.date));

    const current = planRows.find((p) => p.isCurrent) ?? planRows[planRows.length - 1];
    // Nothing to fall back to any more — an account with no plan has no plan.
    const blank = emptyDatabase();

    return {
      intent: intent
        ? {
            daysPerWeek: intent.daysPerWeek,
            split: intent.split,
            goal: intent.goal,
            progressionRule: intent.progressionRule,
            notes: intent.notes,
            inDeficit: intent.inDeficit,
          }
        : blank.intent,
      currentPlan: current?.plan ?? blank.currentPlan,
      planHistory: planRows.filter((p) => !p.isCurrent).map((p) => p.plan),
      sessions: sessionRows.map((s) => ({
        id: s.id,
        date: s.date,
        focus: s.focus,
        status: s.status as LoggedSession["status"],
        accessoriesCompleted: s.accessoriesCompleted,
        feedback: s.feedback,
        extraction: s.extraction,
        sleep: s.sleep as LoggedSession["sleep"],
        sleepSource: s.sleepSource as LoggedSession["sleepSource"],
        lifts: s.lifts,
        soreness: s.soreness,
        loggedAt: s.loggedAt,
      })),
      lastDecisions: state?.lastDecisions ?? [],
      lastSource: (state?.lastSource as Database["lastSource"]) ?? null,
      music: musicRow
        ? {
            genres: musicRow.genres,
            favouriteArtists: musicRow.favouriteArtists,
            avoidArtists: musicRow.avoidArtists,
            explicit: musicRow.explicit,
            familiarity: musicRow.familiarity as MusicPrefs["familiarity"],
            followArc: musicRow.followArc,
            warmupMinutes: musicRow.warmupMinutes,
            cardioMinutes: musicRow.cardioMinutes,
            calmerOnTechniqueDays: musicRow.calmerOnTechniqueDays,
            spotifyConnected: musicRow.spotifyConnected,
          }
        : DEFAULT_MUSIC_PREFS,
      profile: profileRow
        ? {
            name: profileRow.name,
            email: profileRow.email,
            units: profileRow.units as Profile["units"],
            bodyweightKg: profileRow.bodyweightKg,
            heightCm: profileRow.heightCm,
            age: profileRow.age,
            sex: profileRow.sex as Profile["sex"],
            activity: profileRow.activity as Profile["activity"],
            nutritionGoal: profileRow.nutritionGoal as Profile["nutritionGoal"],
            trainingSince: profileRow.trainingSince,
            gymNotes: profileRow.gymNotes,
          }
        : BLANK_PROFILE,
      food: foodRows.map((f) => ({
        id: f.id,
        date: f.date,
        label: f.label,
        kcal: f.kcal,
        protein: f.protein,
        carbs: f.carbs,
        fat: f.fat,
        source: f.source as FoodEntry["source"],
      })),
      weights: weightRows.map((w) => ({ date: w.date, kg: w.kg })),
      calorieAdjustment: state?.calorieAdjustment ?? 0,
      nutritionDecisions: state?.nutritionDecisions ?? [],
    };
  },

  /**
   * Start over. Deletes the training and nutrition history and drops the
   * programme, leaving the account where a new one starts — at the setup
   * questionnaire.
   *
   * Profile and music preferences survive deliberately: they are settings, not
   * history, and having to re-enter your height because you wanted to clear a
   * few bad weeks would be its own small insult. This used to write eight
   * weeks of demo history instead, which made "reset" mean "replace my data
   * with someone else's".
   */
  async reset(userId) {
    const d = db();
    await d.transaction(async (tx) => {
      await tx.delete(t.sessions).where(eq(t.sessions.userId, userId));
      await tx.delete(t.plans).where(eq(t.plans.userId, userId));
      await tx.delete(t.foodEntries).where(eq(t.foodEntries.userId, userId));
      await tx.delete(t.weights).where(eq(t.weights.userId, userId));
      await tx.delete(t.programIntent).where(eq(t.programIntent.userId, userId));
      await tx.delete(t.adaptationState).where(eq(t.adaptationState.userId, userId));
    });
  },

  async saveSession(userId, s: LoggedSession) {
    await db()
      .insert(t.sessions)
      .values({
        id: `${userId}:${s.id}`,
        userId,
        date: s.date,
        focus: s.focus,
        status: s.status,
        accessoriesCompleted: s.accessoriesCompleted,
        feedback: s.feedback,
        extraction: s.extraction ?? null,
        sleep: s.sleep,
        sleepSource: s.sleepSource,
        lifts: s.lifts,
        soreness: s.soreness,
        loggedAt: s.loggedAt,
      })
      // Re-logging a day replaces it rather than adding a second row for the
      // same session — the unique index on (user, date) is what makes that safe.
      .onConflictDoUpdate({
        target: [t.sessions.userId, t.sessions.date],
        set: {
          focus: s.focus,
          status: s.status,
          accessoriesCompleted: s.accessoriesCompleted,
          feedback: s.feedback,
          extraction: s.extraction ?? null,
          sleep: s.sleep,
          sleepSource: s.sleepSource,
          lifts: s.lifts,
          soreness: s.soreness,
          loggedAt: s.loggedAt,
        },
      });
  },

  async savePlan(userId, plan: WeeklyPlan, decisions: AdaptationDecision[], source) {
    const d = db();
    await d.transaction(async (tx) => {
      await tx
        .update(t.plans)
        .set({ isCurrent: false })
        .where(and(eq(t.plans.userId, userId), eq(t.plans.isCurrent, true)));
      await tx.insert(t.plans).values({
        id: planId(userId, plan.weekStart, Date.now()),
        userId,
        weekStart: plan.weekStart,
        blockWeek: plan.blockWeek,
        isCurrent: true,
        plan,
      });
      await tx
        .insert(t.adaptationState)
        .values({
          userId,
          lastDecisions: decisions,
          lastSource: source,
          calorieAdjustment: 0,
          nutritionDecisions: [],
        })
        .onConflictDoUpdate({
          target: t.adaptationState.userId,
          set: { lastDecisions: decisions, lastSource: source },
        });
    });
  },

  async saveIntent(userId, intent) {
    await db()
      .insert(t.programIntent)
      .values({ userId, ...intent })
      .onConflictDoUpdate({ target: t.programIntent.userId, set: { ...intent } });
    return intent;
  },

  async readProfile(userId) {
    const [row] = await db().select().from(t.profiles).where(eq(t.profiles.userId, userId));
    if (!row) return BLANK_PROFILE;
    return {
      name: row.name,
      email: row.email,
      units: row.units as Profile["units"],
      bodyweightKg: row.bodyweightKg,
      heightCm: row.heightCm,
      age: row.age,
      sex: row.sex as Profile["sex"],
      activity: row.activity as Profile["activity"],
      nutritionGoal: row.nutritionGoal as Profile["nutritionGoal"],
      trainingSince: row.trainingSince,
      gymNotes: row.gymNotes,
    };
  },

  async saveProfile(userId, profile: Profile) {
    await db()
      .insert(t.profiles)
      .values({ userId, ...profile })
      .onConflictDoUpdate({ target: t.profiles.userId, set: { ...profile } });
    return profile;
  },

  async readMusicPrefs(userId) {
    const [row] = await db().select().from(t.musicPrefs).where(eq(t.musicPrefs.userId, userId));
    if (!row) return DEFAULT_MUSIC_PREFS;
    return {
      genres: row.genres,
      favouriteArtists: row.favouriteArtists,
      avoidArtists: row.avoidArtists,
      explicit: row.explicit,
      familiarity: row.familiarity as MusicPrefs["familiarity"],
      followArc: row.followArc,
      warmupMinutes: row.warmupMinutes,
      cardioMinutes: row.cardioMinutes,
      calmerOnTechniqueDays: row.calmerOnTechniqueDays,
      spotifyConnected: row.spotifyConnected,
    };
  },

  async saveMusicPrefs(userId, prefs: MusicPrefs) {
    await db()
      .insert(t.musicPrefs)
      .values({ userId, ...prefs })
      .onConflictDoUpdate({ target: t.musicPrefs.userId, set: { ...prefs } });
    return prefs;
  },

  async addFood(userId, entry: FoodEntry) {
    await db()
      .insert(t.foodEntries)
      .values({ ...entry, id: `${userId}:${entry.id}`, userId });
  },

  async removeFood(userId, id: string) {
    // Scoped by user as well as id: without it, knowing an id would be enough
    // to delete a row out of someone else's log.
    await db()
      .delete(t.foodEntries)
      .where(and(eq(t.foodEntries.userId, userId), eq(t.foodEntries.id, id)));
  },

  async saveWeight(userId, entry: WeightEntry) {
    await db()
      .insert(t.weights)
      .values({ userId, ...entry })
      .onConflictDoUpdate({
        target: [t.weights.userId, t.weights.date],
        set: { kg: entry.kg },
      });
  },

  async applyNutritionDecision(userId, decision: NutritionDecision) {
    const d = db();
    const [state] = await d
      .select()
      .from(t.adaptationState)
      .where(eq(t.adaptationState.userId, userId));
    await d
      .insert(t.adaptationState)
      .values({
        userId,
        lastDecisions: state?.lastDecisions ?? [],
        lastSource: state?.lastSource ?? null,
        calorieAdjustment: (state?.calorieAdjustment ?? 0) + decision.deltaKcal,
        nutritionDecisions: [...(state?.nutritionDecisions ?? []), decision],
      })
      .onConflictDoUpdate({
        target: t.adaptationState.userId,
        set: {
          calorieAdjustment: (state?.calorieAdjustment ?? 0) + decision.deltaKcal,
          nutritionDecisions: [...(state?.nutritionDecisions ?? []), decision],
        },
      });
  },
};

export const _internal = { desc };
