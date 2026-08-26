"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { initials } from "@/lib/auth";
import type { Profile } from "@/lib/types";

export default function ProfileForm({ initial }: { initial: Profile }) {
  const [p, setP] = useState<Profile>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function set<K extends keyof Profile>(k: K, v: Profile[K]) {
    setP((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
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
      setSaved(true);
      // The avatar initials live in the layout, so the shell has to re-render.
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <article className="card">
        <div className="profile-head">
          <div className="avatar avatar--lg" aria-hidden="true">
            {initials(p.name || "?")}
          </div>
          <div>
            <h3>{p.name || "Unnamed"}</h3>
            <p className="tiny">{p.email}</p>
          </div>
        </div>

        <div className="field">
          <label className="field-label">Name</label>
          <p className="tiny">Used in the audio briefings, so spell it how you&apos;d say it.</p>
          <input type="text" value={p.name} onChange={(e) => set("name", e.target.value)} />
        </div>

        <div className="field">
          <label className="field-label">Email</label>
          <input type="text" value={p.email} onChange={(e) => set("email", e.target.value)} />
        </div>

        <div className="field">
          <label className="field-label">Units</label>
          <p className="tiny">
            Display only. Loads are stored in kilos throughout — converting the stored unit is
            how a training log ends up with 102.05kg on the bar.
          </p>
          <div className="chips">
            {(["kg", "lb"] as const).map((u) => (
              <button
                type="button"
                key={u}
                className={`pick${p.units === u ? " pick--on" : ""}`}
                aria-pressed={p.units === u}
                onClick={() => set("units", u)}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="field-label">Bodyweight</label>
          <p className="tiny">
            Optional. Only used for context on a deficit — nothing is calculated from it yet.
          </p>
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
          <p className="tiny">
            Used with bodyweight to estimate your calorie needs on the nutrition page.
            Nothing else reads them.
          </p>
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
          <p className="tiny">
            Deficits are capped at 20% and never go below your resting requirement — a
            deficit works by being sustained, not by being severe.
          </p>
        </div>

        <div className="field">
          <label className="field-label">Gym notes</label>
          <p className="tiny">
            Equipment, safety setup, anything the coach should assume. This goes into the
            planning prompt verbatim.
          </p>
          <textarea value={p.gymNotes} onChange={(e) => set("gymNotes", e.target.value)} />
        </div>

        <div className="row">
          <button type="button" onClick={save} disabled={busy}>
            {busy ? "Saving…" : saved ? "Saved" : "Save profile"}
          </button>
          {error && <span className="tiny">{error}</span>}
        </div>
      </article>
    </section>
  );
}
