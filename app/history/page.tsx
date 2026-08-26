import { liftLabel } from "../components";
import { RpeChart } from "../charts";
import { rpeTrend } from "@/lib/analytics";
import { prettyDate } from "@/lib/dates";
import { requireScope } from "@/lib/session";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function History() {
  const { userId } = await requireScope();
  const db = await store.read(userId);
  const sessions = [...db.sessions].reverse().slice(0, 24);

  const total = db.sessions.length;
  const missed = db.sessions.filter((s) => s.lifts.some((l) => !l.hitAllReps)).length;

  return (
    <>
      <section>
        <div>
          <div className="eyebrow">Logged</div>
          <h1>History</h1>
        </div>
        <p className="muted">
          {total} sessions logged · {missed} with missed reps. The most recent 24 are shown.
        </p>
      </section>

      <section>
        <RpeChart data={rpeTrend(db)} />
      </section>

      <section>
        {sessions.map((s) => (
          <article className="card" key={s.id}>
            <div className="card-head">
              <div>
                <div className="eyebrow">{prettyDate(s.date)}</div>
                <h3>{s.focus}</h3>
              </div>
              {s.status === "skipped" ? (
                <span className="chip chip--rest">Skipped</span>
              ) : (
                s.sleep && <span className="tiny">Slept {s.sleep}</span>
              )}
            </div>

            <div className="lifts">
              {s.lifts.map((l) => (
                <div className="lift" key={l.lift}>
                  <span className="lift-name">{liftLabel(l.lift)}</span>
                  <span className="lift-rx">
                    {l.weightKg}kg · {l.repsCompleted}/{l.repsPrescribed} ·{" "}
                    {l.rpe === null ? "no RPE" : `RPE ${l.rpe}`}
                    {!l.hitAllReps && " · missed reps"}
                  </span>
                </div>
              ))}
            </div>

            {s.feedback && <p className="note">&ldquo;{s.feedback}&rdquo;</p>}
          </article>
        ))}
      </section>
    </>
  );
}
