import Link from "next/link";
import { EmptyProgramme } from "../empty-programme";
import { DecisionList, SessionCard } from "../components";
import { AdherenceStrip } from "../charts";
import { adherence } from "@/lib/analytics";
import { prettyRange, today } from "@/lib/dates";
import { requireScope } from "@/lib/session";
import { needsProgrammeSetup } from "@/lib/seed";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Schedule() {
  const { userId } = await requireScope();
  const db = await store.read(userId);
  if (needsProgrammeSetup(db)) return <EmptyProgramme />;

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
            units={db.profile.units}
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

      <section>
        <h2>Change the plan</h2>
        <p className="muted">
          The week is yours to replace. Adapting is what happens between weeks; this is how
          you change what is being adapted.
        </p>
        <Link className="card row-link" href="/plan/new">
          <div>
            <h3>Upload or type your own plan</h3>
            <p className="tiny">
              A PDF or Word file of the programme you follow, or build one by hand. You
              review every line before it saves.
            </p>
          </div>
          <span aria-hidden="true" className="row-link-arrow">
            ›
          </span>
        </Link>
        <Link className="card row-link" href="/plan/setup">
          <div>
            <h3>Change your split or training days</h3>
            <p className="tiny">
              Rebuilds the week from a different shape. Your logged history is untouched.
            </p>
          </div>
          <span aria-hidden="true" className="row-link-arrow">
            ›
          </span>
        </Link>
      </section>

      <div className="row">
        <Link className="btn btn--ghost" href="/upcoming">
          Plan next week →
        </Link>
      </div>
    </>
  );
}
