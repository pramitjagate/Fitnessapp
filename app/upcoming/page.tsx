import { DecisionList, liftLabel } from "../components";
import { LoadSparkline } from "../charts";
import Generate from "./generate";
import { gatherEvidence } from "@/lib/adapt";
import { liftSeries } from "@/lib/analytics";
import { prettyDate, prettyRange } from "@/lib/dates";
import { requireScope } from "@/lib/session";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Upcoming() {
  const { userId } = await requireScope();
  const db = await store.read(userId);
  const evidence = gatherEvidence(db);
  const series = liftSeries(db);
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const loggedThisWeek = db.sessions.filter(
    (s) => s.date >= db.currentPlan.weekStart && s.date <= db.currentPlan.weekEnd
  );

  return (
    <>
      <section>
        <div className="eyebrow">The loop</div>
        <h1>Plan next week</h1>
        <p className="muted">
          This is the whole product. Below is exactly the evidence the coach gets — nothing
          else. It decides, per lift, what should change and why, and code turns those
          decisions into the plan.
        </p>
      </section>

      <Generate hasKey={hasKey} />

      {loggedThisWeek.length === 0 && (
        <div className="banner banner--warn">
          <strong>Nothing logged this week yet.</strong>
          <span>
            Adaptation acts on what happened, so with no new sessions it will hold everything
            rather than re-applying last week&apos;s decisions.
          </span>
        </div>
      )}

      <section>
        <h2>Load, eight weeks</h2>
        <div className="sparks">
          {series.map((s) => (
            <LoadSparkline key={s.lift} series={s} />
          ))}
        </div>
        <p className="tiny">
          A marked point is a week where reps were missed. Flat stretches are where the coach
          is holding rather than pushing.
        </p>
      </section>

      <section>
        <h2>What the coach can see</h2>
        {evidence.map((ev) => (
          <div className="card" key={ev.lift}>
            <div className="card-head">
              <h3>{liftLabel(ev.lift)}</h3>
              <span className="tiny">
                {ev.loggedThisWeek ? "trained this week" : "not trained yet this week"}
              </span>
            </div>
            <div className="lifts">
              {ev.history.length === 0 && <p className="muted">Nothing logged yet.</p>}
              {ev.history.slice(0, 3).map((h) => (
                <div className="lift" key={h.date}>
                  <span className="lift-name">{prettyDate(h.date)}</span>
                  <span className="lift-rx">
                    {h.weightKg}kg · {h.repsCompleted}/{h.repsPrescribed} ·{" "}
                    {h.rpe === null ? "no RPE" : `RPE ${h.rpe}`} ·{" "}
                    {h.hitAllReps ? "all reps" : "missed reps"}
                    {h.sleep ? ` · slept ${h.sleep}` : ""}
                  </span>
                </div>
              ))}
            </div>
            {ev.history[0]?.feedback && (
              // Feedback is captured per SESSION, not per lift — a session with two
              // barbell lifts shares one note. Labelling it stops the note reading as
              // though it were about this lift specifically.
              <p className="note">
                <span className="note-src">Session note</span>
                &ldquo;{ev.history[0].feedback}&rdquo;
              </p>
            )}
          </div>
        ))}
      </section>

      <section>
        <h2>Last decisions</h2>
        <p className="muted">
          From {prettyRange(db.currentPlan.weekStart, db.currentPlan.weekEnd)}, made by{" "}
          {db.lastSource === "model" ? "the model" : "the rule engine"}.
        </p>
        <DecisionList decisions={db.lastDecisions} />
      </section>
    </>
  );
}
