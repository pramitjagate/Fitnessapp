import type {
  AdaptationDecision,
  Database,
  FoodEntry,
  LoggedSession,
  MusicPrefs,
  NutritionDecision,
  Profile,
  WeeklyPlan,
  WeightEntry,
} from "../types";

export interface SessionUserRecord {
  id: string;
  email: string;
  name: string;
}

/**
 * Every method takes a userId. That is the whole point of this interface —
 * there is no way to read "the" data any more, only *someone's* data, so a
 * missing scope is a type error rather than a leak.
 *
 * `read` returns the whole state because every page needs most of it and this
 * is one user's worth of rows, not a feed. If that stops being true, the fix is
 * narrower reads per page rather than caching this one.
 */
export interface Store {
  ensureUser(user: SessionUserRecord): Promise<void>;
  read(userId: string): Promise<Database>;
  reset(userId: string): Promise<void>;

  saveSession(userId: string, session: LoggedSession): Promise<void>;
  savePlan(
    userId: string,
    plan: WeeklyPlan,
    decisions: AdaptationDecision[],
    source: "model" | "rules"
  ): Promise<void>;

  readProfile(userId: string): Promise<Profile>;
  saveProfile(userId: string, profile: Profile): Promise<Profile>;
  readMusicPrefs(userId: string): Promise<MusicPrefs>;
  saveMusicPrefs(userId: string, prefs: MusicPrefs): Promise<MusicPrefs>;

  addFood(userId: string, entry: FoodEntry): Promise<void>;
  removeFood(userId: string, id: string): Promise<void>;
  saveWeight(userId: string, entry: WeightEntry): Promise<void>;
  applyNutritionDecision(userId: string, decision: NutritionDecision): Promise<void>;
}
