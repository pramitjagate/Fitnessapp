import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import * as t from "../db/schema";
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

async function writeSeed(userId: string) {
  const seed = buildSeed();
  const d = db();

  await d.transaction(async (tx) => {
    // A partial seed is worse than none — a user with sessions but no plan
    // lands on a page that can't render.
    await tx.delete(t.plans).where(eq(t.plans.userId, userId));
    await tx.delete(t.sessions).where(eq(t.sessions.userId, userId));
    await tx.delete(t.foodEntries).where(eq(t.foodEntries.userId, userId));
    await tx.delete(t.weights).where(eq(t.weights.userId, userId));

    await tx
      .insert(t.programIntent)
      .values({ userId, ...seed.intent })
      .onConflictDoUpdate({ target: t.programIntent.userId, set: { ...seed.intent } });

    await tx
      .insert(t.profiles)
      .values({ userId, ...seed.profile })
      .onConflictDoNothing();

    await tx
      .insert(t.musicPrefs)
      .values({ userId, ...seed.music })
      .onConflictDoNothing();

    await tx
      .insert(t.adaptationState)
      .values({
        userId,
        lastDecisions: seed.lastDecisions,
        lastSource: seed.lastSource,
        calorieAdjustment: 0,
        nutritionDecisions: [],
      })
      .onConflictDoUpdate({
        target: t.adaptationState.userId,
        set: { lastDecisions: seed.lastDecisions, lastSource: seed.lastSource },
      });

    const planRows = [...seed.planHistory, seed.currentPlan].map((plan, i) => ({
      id: planId(userId, plan.weekStart, i),
      userId,
      weekStart: plan.weekStart,
      blockWeek: plan.blockWeek,
      isCurrent: i === seed.planHistory.length,
      plan,
    }));
    if (planRows.length) await tx.insert(t.plans).values(planRows);

    if (seed.sessions.length) {
      await tx.insert(t.sessions).values(
        seed.sessions.map((s) => ({
          id: `${userId}:${s.id}`,
          userId,
          date: s.date,
          focus: s.focus,
          status: s.status,
          accessoriesCompleted: s.accessoriesCompleted,
          feedback: s.feedback,
          sleep: s.sleep,
          sleepSource: s.sleepSource,
          lifts: s.lifts,
          soreness: s.soreness,
          loggedAt: s.loggedAt,
        }))
      );
    }

    if (seed.food.length) {
      await tx
        .insert(t.foodEntries)
        .values(seed.food.map((f) => ({ ...f, id: `${userId}:${f.id}`, userId })));
    }
    if (seed.weights.length) {
      await tx.insert(t.weights).values(seed.weights.map((w) => ({ ...w, userId })));
    }
  });
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

    if (!existing?.seededAt) {
      // A brand new account lands on the eight weeks of history rather than an
      // empty app with nothing to demonstrate.
      await writeSeed(user.id);
      await d
        .insert(t.profiles)
        .values({ userId: user.id, ...DEFAULT_PROFILE, name: user.name, email: user.email })
        .onConflictDoUpdate({
          target: t.profiles.userId,
          set: { name: user.name, email: user.email },
        });
      await d.update(t.users).set({ seededAt: new Date() }).where(eq(t.users.id, user.id));
    }
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
    const seedFallback = buildSeed();

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
        : seedFallback.intent,
      currentPlan: current?.plan ?? seedFallback.currentPlan,
      planHistory: planRows.filter((p) => !p.isCurrent).map((p) => p.plan),
      sessions: sessionRows.map((s) => ({
        id: s.id,
        date: s.date,
        focus: s.focus,
        status: s.status as LoggedSession["status"],
        accessoriesCompleted: s.accessoriesCompleted,
        feedback: s.feedback,
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
        : DEFAULT_PROFILE,
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

  async reset(userId) {
    const d = db();
    await writeSeed(userId);
    await d
      .update(t.adaptationState)
      .set({ calorieAdjustment: 0, nutritionDecisions: [] })
      .where(eq(t.adaptationState.userId, userId));
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

  async readProfile(userId) {
    const [row] = await db().select().from(t.profiles).where(eq(t.profiles.userId, userId));
    if (!row) return DEFAULT_PROFILE;
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
