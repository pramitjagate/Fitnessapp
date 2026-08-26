import type { Profile } from "./types";

/* ---------------------------------------------------------------------------
 * Macro targets.
 *
 * Every number here is an ESTIMATE from a population equation. Mifflin-St Jeor
 * is the best-validated of the common ones and it is still routinely ±10% for
 * an individual — which on 2,600 kcal is ±260, more than the whole deficit.
 * So the honest design is: show the estimate, show what it was derived from,
 * and treat the scale over three weeks as the real measurement. The page says
 * exactly that rather than presenting a number as a fact.
 *
 * Nothing in here is a prescription, and it deliberately refuses to produce an
 * aggressive one: the deficit is capped and intake is floored at BMR.
 * ------------------------------------------------------------------------- */

/** Activity *outside* the gym. Training is added per session, not baked in. */
const ACTIVITY_FACTOR: Record<Profile["activity"], number> = {
  sedentary: 1.2, // desk job, little walking
  light: 1.3, // some walking, on your feet part of the day
  moderate: 1.4, // on your feet most of the day
  active: 1.55, // physical job
};

/** One hard strength session, in kcal. A rough, deliberately conservative figure. */
const KCAL_PER_SESSION = 350;

const GOAL_ADJUSTMENT: Record<Profile["nutritionGoal"], number> = {
  cut: -0.2, // 20% is about the largest deficit that reliably keeps strength
  recomp: 0,
  gain: 0.1, // a lean gain; bigger surpluses mostly add fat
};

const PROTEIN_PER_KG: Record<Profile["nutritionGoal"], number> = {
  cut: 2.2, // highest need — protein protects muscle when calories are short
  recomp: 2.0,
  gain: 1.8,
};

/** Fat has a floor for hormonal and vitamin-absorption reasons, not preference. */
const FAT_PER_KG = 0.8;

export interface MacroTargets {
  bmr: number;
  maintenance: number;
  trainingDayKcal: number;
  restDayKcal: number;
  averageKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fibreG: number;
  waterMl: number;
  weeklyChangeKg: number;
  /** Things the user should know about their own numbers. */
  warnings: string[];
  /** Which inputs were missing, if the estimate couldn't be produced. */
  missing: string[];
}

export function missingInputs(p: Profile): string[] {
  const missing: string[] = [];
  if (p.bodyweightKg === null) missing.push("bodyweight");
  if (p.heightCm === null) missing.push("height");
  if (p.age === null) missing.push("age");
  return missing;
}

/** Mifflin-St Jeor. The sex term is a fixed offset, hence "unspecified" averaging. */
export function bmr(p: Profile): number {
  const kg = p.bodyweightKg!;
  const cm = p.heightCm!;
  const age = p.age!;
  const offset = p.sex === "male" ? 5 : p.sex === "female" ? -161 : -78;
  return Math.round(10 * kg + 6.25 * cm - 5 * age + offset);
}

export function macroTargets(p: Profile, sessionsPerWeek: number): MacroTargets | null {
  const missing = missingInputs(p);
  if (missing.length) return null;

  const kg = p.bodyweightKg!;
  const warnings: string[] = [];

  const base = bmr(p);
  const nonTraining = base * ACTIVITY_FACTOR[p.activity];
  const trainingPerDay = (KCAL_PER_SESSION * sessionsPerWeek) / 7;
  const maintenance = Math.round(nonTraining + trainingPerDay);

  let average = Math.round(maintenance * (1 + GOAL_ADJUSTMENT[p.nutritionGoal]));

  // The floor. Eating below BMR is where strength, sleep and mood go, and it
  // buys almost nothing — a deficit works by being sustained, not by being
  // severe. If the percentage lands under it, the floor wins.
  if (average < base) {
    average = base;
    warnings.push(
      `A 20% deficit would put you under your resting requirement of ${base} kcal, so the target has been raised to meet it. A smaller deficit held for longer beats a large one abandoned.`
    );
  }

  // Training days get the session cost back; rest days don't. Same weekly total,
  // but the food arrives when the work does.
  const trainingDayKcal = Math.round(average + KCAL_PER_SESSION * (1 - sessionsPerWeek / 7));
  const restDayKcal = Math.round(average - (KCAL_PER_SESSION * sessionsPerWeek) / 7);

  const proteinG = Math.round(kg * PROTEIN_PER_KG[p.nutritionGoal]);
  const fatG = Math.round(kg * FAT_PER_KG);

  const remaining = average - proteinG * 4 - fatG * 9;
  let carbsG = Math.round(remaining / 4);
  if (carbsG < 50) {
    carbsG = Math.max(0, carbsG);
    warnings.push(
      "Protein and fat alone nearly fill the calorie target, leaving very little for carbohydrate. That usually means the deficit is too steep for the bodyweight — raise calories or lower the protein target toward 1.8 g/kg."
    );
  }

  if (p.nutritionGoal === "cut" && sessionsPerWeek >= 4) {
    warnings.push(
      "You're training four or more times a week in a deficit. Expect the plan to hold loads rather than add them — holding weight while losing bodyweight is progress, and the coach treats it that way."
    );
  }

  // 7,700 kcal ≈ 1kg of bodyfat. A weekly rate, from the daily gap.
  const dailyGap = average - maintenance;
  const weeklyChangeKg = Math.round(((dailyGap * 7) / 7700) * 100) / 100;

  return {
    bmr: base,
    maintenance,
    trainingDayKcal,
    restDayKcal,
    averageKcal: average,
    proteinG,
    fatG,
    carbsG,
    fibreG: Math.round((average / 1000) * 14),
    waterMl: Math.round(kg * 35),
    weeklyChangeKg,
    warnings,
    missing: [],
  };
}

export function goalLabel(goal: Profile["nutritionGoal"]): string {
  return { cut: "Lose fat", recomp: "Hold weight", gain: "Gain weight" }[goal];
}

export function activityLabel(a: Profile["activity"]): string {
  return {
    sedentary: "Desk job, little walking",
    light: "Some walking most days",
    moderate: "On your feet most of the day",
    active: "Physical job",
  }[a];
}
