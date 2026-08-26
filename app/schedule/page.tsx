import Link from "next/link";
import { DecisionList, SessionCard } from "../components";
import { AdherenceStrip } from "../charts";
import { adherence } from "@/lib/analytics";
import { prettyRange, today } from "@/lib/dates";
import { requireScope } from "@/lib/session";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Schedule() {
  const { userId } = await requireScope();
  const db = await store.read(userId);
  const plan = db.currentPlan;
  const now = today();
  const loggedDates = new Set(db.sessions.map((s) => s.date));
  const held = db.lastDecisions.filter((d) => d.decision === "hold");
  const done = plan.sessions.filter((s) => loggedDates.has(s.date)).length;

  return (
    <>
      <section>
        <div className="eyebrow">Week {plan.blockWeek} of the block</div>
        <h1>{prettyRange(plan.weekStart, plan.weekEnd)}</h1>
        <p className="muted">{plan.summary}</p>
        <div className="progress" aria-label={`${done} of ${plan.sessions.length} sessions logged`}>
          <div
            className="progress-fill"
            style={{ width: `${(done / plan.sessions.length) * 100}%` }}
          />
        </div>
        <p className="tiny">
          {done} of {plan.sessions.length} logged
        </p>
      </section>

      {held.length > 0 && (
        <div className="banner">
          <strong>
            {held.length === 1
              ? "One lift is deliberately unchanged this week."
              : `${held.length} lifts are deliberately unchanged this week.`}
          </strong>
          <span>
            Holding a load is a decision, not an absence of one — and while you&apos;re eating
            in a deficit it counts as the programme working.
          </span>
        </div>
      )}

      <section>
        {plan.sessions.map((s) => (
          <SessionCard
            key={s.date}
            session={s}
            isToday={s.date === now}
            logged={loggedDates.has(s.date)}
          />
        ))}
      </section>

      <section>
        <h2>Why this week looks like this</h2>
        <p className="muted">{plan.rationale}</p>
        <DecisionList decisions={db.lastDecisions} />
        {db.lastSource && (
          <p className="tiny">
            Decisions made by {db.lastSource === "model" ? "the model" : "the rule engine"}.
          </p>
        )}
      </section>

      <section>
        <h2>Turning up</h2>
        <AdherenceStrip data={adherence(db)} />
      </section>

      <div className="row">
        <Link className="btn btn--ghost" href="/upcoming">
          Plan next week →
        </Link>
      </div>
    </>
  );
}
