"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Generate({ hasKey }: { hasKey: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "adapt" | "reset">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(reset = false) {
    setBusy(reset ? "reset" : "adapt");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/adapt${reset ? "?reset=1" : ""}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setMessage(
        reset
          ? "Reset to the seeded demo."
          : data.note
            ? `Planned by the rule engine. ${data.note}`
            : `Next week planned by ${data.source === "model" ? "the model" : "the rule engine"}.`
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="row">
        <button type="button" onClick={() => run(false)} disabled={busy !== null}>
          {busy === "adapt" ? "Thinking…" : "Generate next week"}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => run(true)}
          disabled={busy !== null}
        >
          {busy === "reset" ? "Resetting…" : "Reset demo"}
        </button>
      </div>

      {!hasKey && (
        <div className="banner banner--warn">
          <strong>No API key set — running on the rule engine.</strong>
          <span>
            The rules implement the same decision table by hand, so the loop works either way.
            Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart to have
            the model make these calls instead, and compare the two.
          </span>
        </div>
      )}

      {message && <div className="banner">{message}</div>}
      {error && <div className="banner banner--warn">{error}</div>}
    </>
  );
}
