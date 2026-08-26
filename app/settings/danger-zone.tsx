"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Two-step rather than a confirm() dialog: the destructive label only appears
 * after you've asked for it, and there's an explicit way back out. A browser
 * confirm() would also work, but it can't say what is about to be lost.
 */
export default function DangerZone({ sessionCount }: { sessionCount: number }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function reset() {
    setBusy(true);
    await fetch("/api/reset", { method: "POST" });
    setBusy(false);
    setArmed(false);
    router.refresh();
  }

  return (
    <article className="card card--danger">
      <div className="card-head">
        <div>
          <h3>Reset the demo</h3>
          <p className="tiny">
            Throws away {sessionCount} logged sessions and every generated plan, and rebuilds
            the seeded eight weeks positioned relative to today.
          </p>
        </div>
      </div>
      {armed ? (
        <div className="row">
          <button type="button" className="btn--danger" onClick={reset} disabled={busy}>
            {busy ? "Resetting…" : "Yes, delete everything"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setArmed(false)}>
            Keep my data
          </button>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="btn btn--ghost" onClick={() => setArmed(true)}>
            Reset to seeded data
          </button>
        </div>
      )}
    </article>
  );
}
