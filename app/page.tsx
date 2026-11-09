import Link from "next/link";
import { EmptyProgramme } from "./empty-programme";
import { liftLabel, phaseLabel, prescription } from "./components";
import { AdherenceStrip, LoadSparkline } from "./charts";
import PlaylistButton from "./playlist";
import { adherence, lastLoads, liftSeries, rpeTrend } from "@/lib/analytics";
import { kgToDisplay, type Units } from "@/lib/units";
import { addDays, dayName, iso, prettyDate, today } from "@/lib/dates";
import { macroTargets } from "@/lib/nutrition";
import { dayTotals, weightTrendKgPerWeek } from "@/lib/nutrition-adapt";
import { requireScope } from "@/lib/session";
import { quoteFor } from "@/lib/quotes";
import { needsProgrammeSetup } from "@/lib/seed";
import { store } from "@/lib/store";
import type { Database, LoggedAccessory, Profile, WeeklyPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Today() {
  const { userId } = await requireScope();
  const [db, profile, spotifyConnection] = await Promise.all([
    store.read(userId),
    store.readProfile(userId),
    store.readSpotifyConnection(userId),
  ]);
  const now = today();
  const plan = db.currentPlan;

  /*
   * Before this branch existed, an account with no plan showed "Rest day" every
   * day of the week — technically true and completely useless. An empty app has
   * to say what to do next, not describe its own emptiness.
   */
  if (needsProgrammeSetup(db)) return <EmptyProgramme heading="Let's build your week" />;

  const session = plan.sessions.find((s) => s.date === now);
  const logged = db.sessions.some((s) => s.date === now);
  const next = plan.sessions.find((s) => s.date > now);
  const series = liftSeries(db);
  const weeks = adherence(db);
  const quote = quoteFor(now);
  const last = lastLoads(db, now);

  // On a training day, the charts follow the lifts being trained. On a rest day
  // there's no session to give context to, so show the four heaviest instead.
  const shownSeries = session
    ? series.filter((s) => session.mainLifts.some((ml) => ml.lift === s.lift))
    : series.slice(0, 4);

  return (
    <>
      {session ? (
        <section className={`hero hero--${session.phase}`}>
          <div className="eyebrow">
            {session.day} · {prettyDate(session.date)} · {phaseLabel(session.phase)} · Week{" "}
            {plan.blockWeek}
          </div>
          <h1>{session.focus}</h1>
          {session.coachingNote && <p className="hero-note">{session.coachingNote}</p>}
          <div className="row hero-actions">
            <Link className="btn" href={`/log/${session.date}`}>
              {logged ? "Edit today's log" : "Log this session"}
            </Link>
            <Link className="btn btn--ghost" href="/schedule">
              See the week
            </Link>
          </div>
        </section>
      ) : (
        <section className="hero hero--rest">
          <div className="eyebrow">
            {prettyDate(now)} · Week {plan.blockWeek}
          </div>
          <h1>Rest day</h1>
          <p className="hero-sub">
            Nothing scheduled. Sleep and protein do more for the next session than anything
            you could do in a gym today.
          </p>
        </section>
      )}

      <figure className="quote">
        <blockquote>{quote.text}</blockquote>
        {quote.author && <figcaption>{quote.author}</figcaption>}
      </figure>

      <Tiles db={db} profile={profile} plan={plan} now={now} />

      {session ? (
        <section>
          <h2>Today&rsquo;s work</h2>
          <div className="big-lifts">
            {session.mainLifts.map((ml) => (
              <div className="big-lift" key={ml.lift}>
                <div className="big-lift-name">{liftLabel(ml.lift)}</div>
                <div className="big-lift-load">
                  {ml.weightKg === null ? (
                    <span className="establish">find your weight</span>
                  ) : (
                    <>
                      {kgToDisplay(ml.weightKg, profile.units)}
                      <span className="big-lift-unit">{profile.units}</span>
                    </>
                  )}
                </div>
                <div className="big-lift-rx">
                  {ml.sets} × {ml.reps} · RPE {ml.targetRpe}
                </div>
              </div>
            ))}
          </div>

          {session.accessories.length > 0 && (
            <div className="card">
              <h3>Then</h3>
              <div className="lifts">
                {session.accessories.map((a) => (
                  <div className="lift" key={a.exercise}>
                    <span className="lift-name">{a.exercise}</span>
                    <span className="lift-rx">
                      {a.sets} × {a.reps}
                      {lastAccessoryLoad(last.accessories[a.exercise.toLowerCase()], profile.units)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        next && (
          <section>
            <h2>Next up</h2>
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="eyebrow">
                    {next.day} · {prettyDate(next.date)}
                  </div>
                  <h3>{next.focus}</h3>
                </div>
                <span className={`chip chip--${next.phase}`}>{phaseLabel(next.phase)}</span>
              </div>
              <div className="lifts">
                {next.mainLifts.map((ml) => (
                  <div className="lift" key={ml.lift}>
                    <span className="lift-name">{liftLabel(ml.lift)}</span>
                    <span className="lift-rx">
                      {prescription(ml.sets, ml.reps, ml.weightKg, ml.targetRpe)}
                    </span>
                  </div>
                ))}
              </div>
              <Link className="btn" href="/schedule">
                See the week
              </Link>
            </div>
          </section>
        )
      )}

      {session && (
        <PlaylistButton
          date={session.date}
          focus={session.focus}
          spotifyConnected={spotifyConnection !== null}
        />
      )}

      {shownSeries.length > 0 && (
        <section>
          <h2>{session ? "Where these lifts have been" : "Your lifts"}</h2>
          <div className="sparks">
            {shownSeries.map((s) => (
              <LoadSparkline key={s.lift} series={s} units={profile.units} />
            ))}
          </div>
        </section>
      )}

      {weeks.length > 0 && (
        <section>
          <AdherenceStrip data={weeks} />
        </section>
      )}
    </>
  );
}

/**
 * The at-a-glance row: four numbers, each a link to the page that explains it.
 * A tile that can't say something true says what's missing instead of showing 0.
 */
function Tiles({
  db,
  profile,
  plan,
  now,
}: {
  db: Database;
  profile: Profile;
  plan: WeeklyPlan;
  now: string;
}) {
  const units = profile.units;

  // This week, Monday to Sunday, against the plan.
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    iso(addDays(new Date(plan.weekStart + "T12:00:00"), i))
  );
  const days = weekDays.map((date) => {
    const planned = plan.sessions.some((s) => s.date === date);
    const log = db.sessions.find((s) => s.date === date);
    const state = log
      ? log.status === "completed"
        ? "done"
        : "skipped"
      : planned
        ? date < now
          ? "missed"
          : "planned"
        : "rest";
    return { date, state, isToday: date === now };
  });
  const done = days.filter((d) => d.state === "done").length;

  // Same targets the food log measures against, so the two pages agree.
  const estimate = macroTargets(profile, db.intent.daysPerWeek);
  const targetKcal = estimate ? estimate.averageKcal + db.calorieAdjustment : null;
  const eaten = dayTotals(db.food, now);

  const latestKg = db.weights.at(-1)?.kg ?? profile.bodyweightKg;
  const trend = weightTrendKgPerWeek(db.weights);

  const rpe = rpeTrend(db, 2);
  const rpeNow = rpe.at(-1);
  const rpeDrift = rpe.length === 2 ? Math.round((rpe[1].avgRpe - rpe[0].avgRpe) * 10) / 10 : null;

  return (
    <section className="tiles" aria-label="This week at a glance">
      <Link href="/schedule" className="tile">
        <span className="eyebrow">This week</span>
        <span className="stat-n">
          {done}
          <em>/{plan.sessions.length}</em>
        </span>
        <span className="week-dots" aria-label={`${done} of ${plan.sessions.length} sessions done`}>
          {days.map((d) => (
            <span
              key={d.date}
              className={`wd wd--${d.state}${d.isToday ? " wd--today" : ""}`}
              title={`${dayName(d.date)}: ${d.state}`}
            >
              {dayName(d.date).slice(0, 1)}
            </span>
          ))}
        </span>
      </Link>

      <Link href={targetKcal ? "/nutrition" : "/profile"} className="tile">
        <span className="eyebrow">Fuel today</span>
        {targetKcal && estimate ? (
          <>
            <span className="stat-n">
              {eaten.kcal}
              <em>/{targetKcal} kcal</em>
            </span>
            <Meter value={eaten.kcal} target={targetKcal} />
            <span className="tiny">
              {eaten.protein}/{estimate.proteinG}g protein
            </span>
          </>
        ) : (
          <span className="tiny">Add bodyweight, height and age to get a target.</span>
        )}
      </Link>

      <Link href="/nutrition" className="tile">
        <span className="eyebrow">Bodyweight</span>
        {latestKg !== null ? (
          <>
            <span className="stat-n">
              {kgToDisplay(latestKg, units)}
              <em>{units}</em>
            </span>
            <span className="tiny">
              {trend === null
                ? "Six weigh-ins in 14 days to see a trend"
                : `${trend > 0 ? "+" : ""}${perWeek(trend, units)}${units} a week`}
            </span>
          </>
        ) : (
          <span className="tiny">No weigh-ins yet.</span>
        )}
      </Link>

      <Link href="/history" className="tile">
        <span className="eyebrow">Effort</span>
        {rpeNow ? (
          <>
            <span className="stat-n">
              {rpeNow.avgRpe}
              <em>RPE</em>
            </span>
            <span className="tiny">
              {rpeDrift === null
                ? "Average across this week's lifts"
                : rpeDrift === 0
                  ? "Same as last week"
                  : `${rpeDrift > 0 ? "Up" : "Down"} ${Math.abs(rpeDrift)} on last week`}
            </span>
          </>
        ) : (
          <span className="tiny">Log a session with RPE to see this.</span>
        )}
      </Link>
    </section>
  );
}

function Meter({ value, target }: { value: number; target: number }) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <div className="bar-track" aria-hidden="true">
      <div className={`bar-fill${value > target ? " bar-fill--over" : ""}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** " · 20/22.5/25kg last time" — what the log will pre-fill, shown before you open it. */
function lastAccessoryLoad(a: LoggedAccessory | undefined, units: Units): string {
  if (!a) return "";
  if (a.setWeightsKg?.length) {
    return ` · ${a.setWeightsKg.map((kg) => kgToDisplay(kg, units)).join("/")}${units} last time`;
  }
  if (a.weightKg === null) return " · bodyweight";
  return ` · ${kgToDisplay(a.weightKg, units)}${units} last time`;
}

/** Weekly change is small, so it keeps a decimal kgToDisplay would round away. */
function perWeek(kg: number, units: Units): number {
  return units === "lb" ? Math.round(kg * 2.2046226218 * 10) / 10 : Math.round(kg * 100) / 100;
}
