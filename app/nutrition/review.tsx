"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decisionLabel } from "@/lib/nutrition-adapt";
import type { NutritionEvidence } from "@/lib/nutrition-adapt";
import type { NutritionDecision } from "@/lib/types";

export default function NutritionReview({
  evidence,
  decision,
  adjustment,
  history,
}: {
  evidence: NutritionEvidence;
  decision: NutritionDecision;
  adjustment: number;
  history: NutritionDecision[];
}) {
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const router = useRouter();

  const actionable = decision.deltaKcal !== 0;

  async function apply() {
    setBusy(true);
    await fetch("/api/nutrition-adapt", { method: "POST" });
    setBusy(false);
    setApplied(true);
    router.refresh();
  }

  return (
    <section>
      <div>
        <div className="eyebrow">The loop</div>
        <h2>Two-week review</h2>
      </div>
      <p className="muted">
        The same rule as the training side: never change on one week&apos;s data, and check
        whether the target was <em>followed</em> before deciding whether it was{" "}
        <em>wrong</em>.
      </p>

      <article className={`card${actionable ? " card--today" : ""}`}>
        <div className="card-head">
          <div>
            <h3>{decisionLabel(decision.decision)}</h3>
          </div>
          <span className={`chip${actionable ? " chip--today" : ""}`}>
            {decision.deltaKcal === 0
              ? "no change"
              : `${decision.deltaKcal > 0 ? "+" : ""}${decision.deltaKcal} kcal`}
          </span>
        </div>

        <p className="muted">{decision.reason}</p>

        <div className="lifts">
          {decision.evidence.map((e) => (
            <div className="lift" key={e}>
              <span className="lift-rx evidence-line">{e}</span>
            </div>
          ))}
        </div>

        {actionable && !applied && (
          <div className="row">
            <button type="button" onClick={apply} disabled={busy}>
              {busy ? "Applying…" : `Apply ${decision.deltaKcal > 0 ? "+" : ""}${decision.deltaKcal} kcal`}
            </button>
            <span className="tiny">
              You see the reasoning before the number moves — never after.
            </span>
          </div>
        )}

        {applied && <div className="banner">Applied. Every target on this page has moved.</div>}
      </article>

      {adjustment !== 0 && (
        <article className="card">
          <div className="card-head">
            <div>
              <h3>Standing adjustment</h3>
              <p className="tiny">
                What reality has argued for, held separately from the equation&apos;s estimate
                so you can always see both.
              </p>
            </div>
            <span className="chip">
              {adjustment > 0 ? "+" : ""}
              {adjustment} kcal
            </span>
          </div>
          {history.length > 0 && (
            <ul className="ingredients">
              {history.map((h) => (
                <li key={h.decidedOn + h.reason}>
                  <span>{decisionLabel(h.decision)}</span>
                  <span className="tiny">
                    {h.decidedOn} · {h.deltaKcal > 0 ? "+" : ""}
                    {h.deltaKcal} kcal
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      )}

      <p className="tiny">
        Logged {evidence.daysLogged} of the last {evidence.daysInWindow} days ·{" "}
        {evidence.weightReadings} weigh-ins. Gaps are fine; the bar is eight logged days and
        six weigh-ins before the loop will say anything at all.
      </p>
    </section>
  );
}
