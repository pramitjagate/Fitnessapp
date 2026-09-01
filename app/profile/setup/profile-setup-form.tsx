"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Profile } from "@/lib/types";

/* ---------------------------------------------------------------------------
 * The body-stat half of onboarding, split out from the full profile page.
 *
 * Signing up asks what the lifter trains, not who they are — that split
 * meant a new account's calorie estimate silently ran on nobody's numbers
 * (see lib/types.ts BLANK_PROFILE). This is the fix: one short stop between
 * creating an account and the training-split questions in /plan/setup,
 * asking only what the nutrition estimate needs. Everything else about the
 * profile (name, units, gym notes) stays on the full profile page, editable
 * any time.
 * ------------------------------------------------------------------------- */

export default function ProfileSetupForm({ initial, firstRun }: { initial: Profile; firstRun: boolean }) {
  const [p, setP] = useState<Profile>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function set<K extends keyof Profile>(k: K, v: Profile[K]) {
    setP((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save.");
      router.push("/plan/setup");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <section>
        <article className="card">
          <div className="field">
            <label className="field-label">Bodyweight</label>
            <p className="tiny">Optional. Skip it and the estimate waits until you add it later.</p>
            <div className="minutes">
              <label className="mins">
                <input
                  type="number"
                  min={20}
                  max={300}
                  value={p.bodyweightKg ?? ""}
                  onChange={(e) =>
                    set("bodyweightKg", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
                <span className="tiny">kg</span>
              </label>
            </div>
          </div>

          <div className="field">
            <label className="field-label">Height and age</label>
            <div className="minutes">
              <label className="mins">
                <input
                  type="number"
                  min={120}
                  max={230}
                  value={p.heightCm ?? ""}
                  onChange={(e) =>
                    set("heightCm", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
                <span className="tiny">cm</span>
              </label>
              <label className="mins">
                <input
                  type="number"
                  min={14}
                  max={100}
                  value={p.age ?? ""}
                  onChange={(e) => set("age", e.target.value === "" ? null : Number(e.target.value))}
                />
                <span className="tiny">years</span>
              </label>
            </div>
          </div>

          <div className="field">
            <label className="field-label">Sex</label>
            <p className="tiny">
              The calorie equation takes a fixed offset for it. Leave it unspecified and the
              estimate splits the difference.
            </p>
            <div className="chips">
              {(
                [
                  ["male", "Male"],
                  ["female", "Female"],
                  ["unspecified", "Rather not say"],
                ] as const
              ).map(([v, label]) => (
                <button
                  type="button"
                  key={v}
                  className={`pick${p.sex === v ? " pick--on" : ""}`}
                  aria-pressed={p.sex === v}
                  onClick={() => set("sex", v)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label">Daily activity</label>
            <p className="tiny">
              Life outside the gym. Training sessions are counted separately, so don&apos;t pay
              for them twice here.
            </p>
            <div className="chips">
              {(
                [
                  ["sedentary", "Desk job"],
                  ["light", "Some walking"],
                  ["moderate", "On my feet"],
                  ["active", "Physical job"],
                ] as const
              ).map(([v, label]) => (
                <button
                  type="button"
                  key={v}
                  className={`pick${p.activity === v ? " pick--on" : ""}`}
                  aria-pressed={p.activity === v}
                  onClick={() => set("activity", v)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label">Nutrition goal</label>
            <div className="chips">
              {(
                [
                  ["cut", "Lose fat"],
                  ["recomp", "Hold weight"],
                  ["gain", "Gain weight"],
                ] as const
              ).map(([v, label]) => (
                <button
                  type="button"
                  key={v}
                  className={`pick${p.nutritionGoal === v ? " pick--on" : ""}`}
                  aria-pressed={p.nutritionGoal === v}
                  onClick={() => set("nutritionGoal", v)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </article>
      </section>

      {error && (
        <section>
          <div className="banner banner--warn">{error}</div>
        </section>
      )}

      <section>
        <article className="card">
          <button className="wide" disabled={busy} onClick={save} type="button">
            {busy ? "Saving…" : "Continue"}
          </button>
          {firstRun && (
            <p className="tiny">
              <button
                type="button"
                className="link-btn"
                disabled={busy}
                onClick={() => router.push("/plan/setup")}
              >
                Skip for now
              </button>{" "}
              — you can fill this in from your profile any time.
            </p>
          )}
        </article>
      </section>
    </>
  );
}
