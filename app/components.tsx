import Link from "next/link";
import { prettyDate } from "@/lib/dates";
import { formatWeight, type Units } from "@/lib/units";
import type { AdaptationDecision, PlannedSession } from "@/lib/types";

export function liftLabel(lift: string): string {
  return lift.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function phaseLabel(phase: string): string {
  return phase.replace(/_/g, " ");
}

/** "3 × 5 @ 145lb · RPE 7.5", or the establish-load state when weight is null. */
export function prescription(
  sets: number,
  reps: string,
  weightKg: number | null,
  rpe: number,
  units: Units = "kg",
) {
  if (weightKg === null) {
    return `${sets} × ${reps} · find your working weight · RPE ${rpe}`;
  }
  return `${sets} × ${reps} @ ${formatWeight(weightKg, units)} · RPE ${rpe}`;
}

export function SessionCard({
  session,
  isToday,
  logged,
  units = "kg",
}: {
  session: PlannedSession;
  isToday: boolean;
  logged: boolean;
  units?: Units;
}) {
  return (
    <article className={`card${isToday ? " card--today" : ""}`}>
      <div className="card-head">
        <div>
          <div className="eyebrow">
            {session.day} · {prettyDate(session.date)}
          </div>
          <h2>{session.focus}</h2>
        </div>
        <div className="row">
          {isToday && <span className="chip chip--today">Today</span>}
          <span className={`chip chip--${session.phase}`}>{phaseLabel(session.phase)}</span>
        </div>
      </div>

      <div className="lifts">
        {session.mainLifts.map((ml) => (
          <div className="lift" key={ml.lift}>
            <span className="lift-name">{liftLabel(ml.lift)}</span>
            <span className="lift-rx">
              {prescription(ml.sets, ml.reps, ml.weightKg, ml.targetRpe, units)}
            </span>
          </div>
        ))}
      </div>

      {session.accessories.length > 0 && (
        <p className="accessories">
          {session.accessories.map((a) => `${a.exercise} ${a.sets}×${a.reps}`).join(" · ")}
        </p>
      )}

      {session.coachingNote && <p className="note">{session.coachingNote}</p>}

      <div className="row">
        <Link className="btn" href={`/log/${session.date}`}>
          {logged ? "Edit log" : "Log this session"}
        </Link>
        {logged && <span className="tiny">Logged</span>}
      </div>
    </article>
  );
}

export function DecisionList({ decisions }: { decisions: AdaptationDecision[] }) {
  if (decisions.length === 0) {
    return <p className="muted">No decisions recorded yet.</p>;
  }
  return (
    <div className="decisions">
      {decisions.map((d) => (
        <div className="decision" key={d.lift}>
          <div className="decision-verdict">
            <span className={`verdict verdict--${d.decision}`}>
              {d.decision.replace(/_/g, " ")}
            </span>
            <span className="tiny">{liftLabel(d.lift)}</span>
          </div>
          <p>{d.reason}</p>
        </div>
      ))}
    </div>
  );
}
