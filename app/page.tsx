import Link from "next/link";
import { EmptyProgramme } from "./empty-programme";
import { liftLabel, phaseLabel, prescription } from "./components";
import { LoadSparkline } from "./charts";
import PlaylistButton from "./playlist";
import { liftSeries } from "@/lib/analytics";
import { kgToDisplay } from "@/lib/units";
import { prettyDate, today } from "@/lib/dates";
import { requireScope } from "@/lib/session";
import { needsProgrammeSetup } from "@/lib/seed";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Today() {
  const { userId } = await requireScope();
  const db = await store.read(userId);
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

  if (!session) {
    return (
      <>
        <section className="hero hero--rest">
          <div className="eyebrow">{prettyDate(now)}</div>
          <h1>Rest day</h1>
          <p className="hero-sub">
            Nothing scheduled. Sleep and protein do more for the next session than anything
            you could do in a gym today.
          </p>
        </section>

        {next && (
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
        )}
      </>
    );
  }

  // Charts for the lifts actually being trained today — context where it's useful,
  // rather than a dashboard of everything.
  const todaysSeries = series.filter((s) => session.mainLifts.some((ml) => ml.lift === s.lift));

  return (
    <>
      <section className={`hero hero--${session.phase}`}>
        <div className="eyebrow">
          {session.day} · {prettyDate(session.date)} · {phaseLabel(session.phase)}
        </div>
        <h1>{session.focus}</h1>
        {session.coachingNote && <p className="hero-note">{session.coachingNote}</p>}
      </section>

      <section>
        <div className="big-lifts">
          {session.mainLifts.map((ml) => (
            <div className="big-lift" key={ml.lift}>
              <div className="big-lift-name">{liftLabel(ml.lift)}</div>
              <div className="big-lift-load">
                {ml.weightKg === null ? (
                  <span className="establish">find your weight</span>
                ) : (
                  <>
                    {kgToDisplay(ml.weightKg, db.profile.units)}
                    <span className="big-lift-unit">{db.profile.units}</span>
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
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="row">
          <Link className="btn" href={`/log/${session.date}`}>
            {logged ? "Edit today's log" : "Log this session"}
          </Link>
          <Link className="btn btn--ghost" href="/schedule">
            See the week
          </Link>
        </div>
      </section>

      <PlaylistButton date={session.date} />

      {todaysSeries.length > 0 && (
        <section>
          <h2>Where these lifts have been</h2>
          <div className="sparks">
            {todaysSeries.map((s) => (
              <LoadSparkline key={s.lift} series={s} units={db.profile.units} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
