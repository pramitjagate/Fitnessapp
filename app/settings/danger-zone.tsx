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
    <>
      <article className="card card--danger">
        <div className="card-head">
          <div>
            <h3>Start over</h3>
            <p className="tiny">
              Deletes {sessionCount} logged sessions, every plan, and your food and weight
              history, and takes you back to the setup questions. Your profile and music
              preferences are kept. There is no undo.
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

      <DeleteAccount />
    </>
  );
}

/**
 * Deletes the account itself, not just its data — there is nothing left to
 * sign back into afterward, which is why this asks for the password rather
 * than reusing the "Start over" flow's arm/confirm alone. A cookie left open
 * on a shared machine can click a button; it can't type a password.
 */
function DeleteAccount() {
  const [armed, setArmed] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete the account.");
      router.replace("/login?accountDeleted=1");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <article className="card card--danger">
      <div className="card-head">
        <div>
          <h3>Delete account</h3>
          <p className="tiny">
            Erases the account itself, not just its data — your login, profile, every plan
            and every logged session. There is nothing left to sign back into. No undo.
          </p>
        </div>
      </div>
      {armed ? (
        <>
          <div className="field">
            <label className="field-label">Confirm your password</label>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div className="banner banner--warn">{error}</div>}
          <div className="row">
            <button
              type="button"
              className="btn--danger"
              onClick={deleteAccount}
              disabled={busy || !password}
            >
              {busy ? "Deleting…" : "Yes, delete my account"}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setArmed(false);
                setPassword("");
                setError(null);
              }}
            >
              Keep my account
            </button>
          </div>
        </>
      ) : (
        <div className="row">
          <button type="button" className="btn btn--ghost" onClick={() => setArmed(true)}>
            Delete my account
          </button>
        </div>
      )}
    </article>
  );
}
