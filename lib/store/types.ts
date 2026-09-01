import type {
  AdaptationDecision,
  Database,
  FoodEntry,
  LoggedSession,
  MusicPrefs,
  NutritionDecision,
  ProgramIntent,
  Profile,
  WeeklyPlan,
  WeightEntry,
} from "../types";

export interface SessionUserRecord {
  id: string;
  email: string;
  name: string;
}

/** A row from the users table, password hash included. Never leaves the server. */
export interface AccountRecord extends SessionUserRecord {
  passwordHash: string | null;
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

  /* --- accounts and sessions ---------------------------------------------
   * Kept on the store rather than in a separate module so both backends stay
   * swappable: the JSON path is what makes `git clone && npm run dev` work
   * with no database, and auth that only worked on Postgres would quietly end
   * that.
   * --------------------------------------------------------------------- */

  /** The account for an email, or null. Case-insensitive on the caller's side. */
  findAccount(email: string): Promise<AccountRecord | null>;
  /** Creates the account, or attaches a password to one that predates sign-up. */
  createAccount(account: AccountRecord): Promise<void>;

  /** Stores a live session. `tokenHash` is SHA-256 of the token, never the token. */
  createAuthSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void>;
  /** The signed-in user for a token hash, or null when unknown or expired. */
  readAuthSession(tokenHash: string): Promise<SessionUserRecord | null>;
  /** Sign out. Ends this one session, not every session the person has. */
  deleteAuthSession(tokenHash: string): Promise<void>;
  /**
   * Erases the account and everything scoped to it — every session, plan,
   * profile field, food and weight entry, every live login. Unlike `reset`,
   * there is no account left to sign back into afterward.
   */
  deleteAccount(userId: string): Promise<void>;
  read(userId: string): Promise<Database>;
  reset(userId: string): Promise<void>;

  saveSession(userId: string, session: LoggedSession): Promise<void>;
  savePlan(
    userId: string,
    plan: WeeklyPlan,
    decisions: AdaptationDecision[],
    source: "model" | "rules"
  ): Promise<void>;

  /**
   * Replacing the programme is a deliberate act, not an adaptation — loading a
   * written plan, or starting a new block. The coach changes the *plan*; only
   * the lifter changes the *programme*.
   */
  saveIntent(userId: string, intent: ProgramIntent): Promise<ProgramIntent>;

  readProfile(userId: string): Promise<Profile>;
  saveProfile(userId: string, profile: Profile): Promise<Profile>;
  readMusicPrefs(userId: string): Promise<MusicPrefs>;
  saveMusicPrefs(userId: string, prefs: MusicPrefs): Promise<MusicPrefs>;

  addFood(userId: string, entry: FoodEntry): Promise<void>;
  removeFood(userId: string, id: string): Promise<void>;
  saveWeight(userId: string, entry: WeightEntry): Promise<void>;
  applyNutritionDecision(userId: string, decision: NutritionDecision): Promise<void>;
}
