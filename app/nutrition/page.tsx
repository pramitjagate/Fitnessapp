import Link from "next/link";
import FoodLog from "./food-log";
import NutritionReview from "./review";
import RecipeBrowser from "./recipe-browser";
import { WeightTrend } from "../charts";
import { today } from "@/lib/dates";
import { activityLabel, goalLabel, macroTargets } from "@/lib/nutrition";
import {
  decideNutrition,
  gatherNutritionEvidence,
  lastNDays,
  weightTrendKgPerWeek,
} from "@/lib/nutrition-adapt";
import { ALL_RECIPES } from "@/lib/recipes";
import { requireScope } from "@/lib/session";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function NutritionPage() {
  const { userId } = await requireScope();
  const [profile, db] = await Promise.all([store.readProfile(userId), store.read(userId)]);
  const sessionsPerWeek = db.intent.daysPerWeek;
  const estimate = macroTargets(profile, sessionsPerWeek);
  const targets = estimate
    ? { ...estimate, averageKcal: estimate.averageKcal + db.calorieAdjustment }
    : null;
  const date = today();

  if (!targets || !estimate) {
    return (
      <>
        <section>
          <div>
            <div className="eyebrow">Fuel</div>
            <h1>Nutrition</h1>
          </div>
        </section>
        <section>
          <div className="banner banner--warn">
            <strong>Three numbers missing.</strong>
            Bodyweight, height and age are what the estimate is built from — without them
            there is nothing honest to show here. A guessed target is worse than no target.
          </div>
          <div className="row">
            <Link href="/profile" className="btn">
              Add them on your profile
            </Link>
          </div>
        </section>
      </>
    );
  }

  const trend = weightTrendKgPerWeek(db.weights);
  const ev = gatherNutritionEvidence(db, profile);
  const review = ev ? { evidence: ev, decision: decideNutrition(db, profile, ev) } : null;

  const macroCals = {
    p: targets.proteinG * 4,
    c: targets.carbsG * 4,
    f: targets.fatG * 9,
  };
  const total = macroCals.p + macroCals.c + macroCals.f;
  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <>
      <section>
        <div>
          <div className="eyebrow">Fuel</div>
          <h1>Nutrition</h1>
        </div>
        <p className="muted">
          {goalLabel(profile.nutritionGoal).toLowerCase()} · {profile.bodyweightKg}kg ·{" "}
          {profile.heightCm}cm · {profile.age} · {activityLabel(profile.activity).toLowerCase()}{" "}
          · {sessionsPerWeek} sessions a week.{" "}
          <Link href="/profile">Change any of these</Link> and every number below moves.
        </p>
      </section>

      <section>
        <article className="card card--today">
          <div className="card-head">
            <div>
              <div className="eyebrow">Daily average</div>
              <h2>{targets.averageKcal} kcal</h2>
            </div>
            <span className="chip chip--today">{goalLabel(profile.nutritionGoal)}</span>
          </div>
          {db.calorieAdjustment !== 0 && (
            <p className="tiny">
              The equation said {estimate.averageKcal}; two weeks of your own data argued for{" "}
              {db.calorieAdjustment > 0 ? "+" : ""}
              {db.calorieAdjustment}. Your numbers win — that&apos;s the whole point of
              measuring.
            </p>
          )}
          <p className="tiny">
            Maintenance is about {targets.maintenance} kcal, so this is a{" "}
            {Math.abs(targets.averageKcal - targets.maintenance)} kcal{" "}
            {targets.averageKcal < targets.maintenance ? "deficit" : "surplus"} — roughly{" "}
            {Math.abs(targets.weeklyChangeKg)}kg a week if it holds.
          </p>
        </article>

        <div className="grid-2 macro-grid">
          <article className="card stat">
            <span className="eyebrow">Protein</span>
            <span className="stat-n">
              {targets.proteinG}
              <em>g</em>
            </span>
            <span className="tiny">{pct(macroCals.p)}% of calories · the one to hit first</span>
          </article>
          <article className="card stat">
            <span className="eyebrow">Carbs</span>
            <span className="stat-n">
              {targets.carbsG}
              <em>g</em>
            </span>
            <span className="tiny">{pct(macroCals.c)}% · fuel for the session</span>
          </article>
          <article className="card stat">
            <span className="eyebrow">Fat</span>
            <span className="stat-n">
              {targets.fatG}
              <em>g</em>
            </span>
            <span className="tiny">{pct(macroCals.f)}% · a floor, not a target</span>
          </article>
        </div>

        <article className="card">
          <div className="card-head">
            <div>
              <h3>Training days eat more</h3>
              <p className="tiny">
                Same weekly total, arranged so the food arrives when the work does. Both
                numbers already include the {sessionsPerWeek} sessions in your plan.
              </p>
            </div>
          </div>
          <div className="lifts">
            <div className="lift">
              <span className="lift-name">Training day</span>
              <span className="lift-rx">{targets.trainingDayKcal} kcal</span>
            </div>
            <div className="lift">
              <span className="lift-name">Rest day</span>
              <span className="lift-rx">{targets.restDayKcal} kcal</span>
            </div>
            <div className="lift">
              <span className="lift-name">Protein, every day</span>
              <span className="lift-rx">{targets.proteinG}g</span>
            </div>
            <div className="lift">
              <span className="lift-name">Fibre</span>
              <span className="lift-rx">{targets.fibreG}g</span>
            </div>
            <div className="lift">
              <span className="lift-name">Water</span>
              <span className="lift-rx">{(targets.waterMl / 1000).toFixed(1)}L</span>
            </div>
          </div>
        </article>

        {targets.warnings.map((w) => (
          <div className="banner banner--warn" key={w}>
            {w}
          </div>
        ))}
      </section>

      <section>
        <article className="card">
          <div className="card-head">
            <div>
              <h3>Where these numbers came from</h3>
            </div>
          </div>
          <div className="lifts">
            <div className="lift">
              <span className="lift-name">Resting requirement</span>
              <span className="lift-rx">{targets.bmr} kcal · Mifflin-St Jeor</span>
            </div>
            <div className="lift">
              <span className="lift-name">Daily life</span>
              <span className="lift-rx">{activityLabel(profile.activity)}</span>
            </div>
            <div className="lift">
              <span className="lift-name">Training</span>
              <span className="lift-rx">~350 kcal × {sessionsPerWeek} sessions</span>
            </div>
            <div className="lift">
              <span className="lift-name">Protein</span>
              <span className="lift-rx">
                {(targets.proteinG / (profile.bodyweightKg ?? 1)).toFixed(1)} g per kg
              </span>
            </div>
          </div>
          <p className="tiny">
            <strong>Read this as a starting point, not a fact.</strong> Mifflin-St Jeor is the
            best-validated of the common equations and is still routinely ±10% for an
            individual — on this target that&apos;s ±
            {Math.round(targets.averageKcal * 0.1)} kcal, more than the whole deficit. The
            real measurement is bodyweight over three weeks: if it isn&apos;t moving the way
            you want, change the calories by 150 and wait another two weeks. Chasing the
            scale day to day mostly measures water and salt.
          </p>
          <p className="tiny">
            General information, not medical or dietary advice. If you&apos;re pregnant,
            managing a health condition, taking medication that interacts with diet, or have
            any history of disordered eating, talk to a doctor or a registered dietitian
            before acting on any of it — and the deficit here is deliberately capped at 20%
            and floored at your resting requirement for the same reason.
          </p>
        </article>
      </section>

      <FoodLog
        date={date}
        entries={db.food.filter((f) => f.date === date)}
        recipes={ALL_RECIPES}
        targetKcal={targets.averageKcal}
        targetProtein={targets.proteinG}
        latestWeight={db.weights.at(-1)?.kg ?? profile.bodyweightKg}
      />

      <section>
        <div>
          <div className="eyebrow">Fourteen days</div>
          <h2>Weight trend</h2>
        </div>
        <p className="muted">
          The line is the regression, not the readings — day to day, bodyweight is mostly
          water and salt. Trending{" "}
          <strong>
            {trend === null
              ? "not enough readings yet"
              : `${trend > 0 ? "+" : ""}${trend}kg a week`}
          </strong>
          .
        </p>
        {/* The chart plots exactly the window the loop reads. Showing 21 days
            beside a 14-day trend figure meant the page quoted two different
            slopes for the same line. */}
        <WeightTrend points={db.weights.filter((w) => lastNDays(14).includes(w.date))} />
      </section>

      {review && (
        <NutritionReview
          evidence={review.evidence}
          decision={review.decision}
          adjustment={db.calorieAdjustment}
          history={db.nutritionDecisions}
        />
      )}

      <RecipeBrowser recipes={ALL_RECIPES} proteinTarget={targets.proteinG} />
    </>
  );
}
