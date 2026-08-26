"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { liftLabel } from "@/app/components";
import type { PlannedSession, LoggedSession, Sleep } from "@/lib/types";

type LiftEntry = {
  lift: string;
  setsPrescribed: number;
  repsPrescribed: string;
  weightKg: number;
  repsCompleted: string;
  rpe: string;
  hitAllReps: boolean;
};


/**
 * Weight and RPE move in fixed increments, so a stepper beats a keyboard: no
 * keypad covering half the screen, no decimal typo, and 44px targets you can
 * hit without looking. The field stays editable for the case the buttons are
 * slow for — jumping 20kg.
 */
function Stepper({
  label,
  value,
  step,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  return (
    <div className="stepper">
      <span className="field-label">{label}</span>
      <div className="stepper-row">
        <button
          type="button"
          className="stepper-btn"
          onClick={() => onChange(clamp(value - step))}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <label className="stepper-value">
          <input
            type="number"
            inputMode="decimal"
            step={step}
            value={value}
            onChange={(e) => onChange(clamp(Number(e.target.value)))}
          />
          {suffix && <span className="tiny">{suffix}</span>}
        </label>
        <button
          type="button"
          className="stepper-btn"
          onClick={() => onChange(clamp(value + step))}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function LogForm({
  session,
  existing,
}: {
  session: PlannedSession;
  existing: LoggedSession | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lifts, setLifts] = useState<LiftEntry[]>(() =>
    session.mainLifts.map((ml) => {
      const prev = existing?.lifts.find((l) => l.lift === ml.lift);
      return {
        lift: ml.lift,
        setsPrescribed: ml.sets,
        repsPrescribed: ml.reps,
        // Prescribed values pre-fill so a session that went to plan is three
        // taps. You only edit what differed.
        weightKg: prev?.weightKg ?? ml.weightKg ?? 0,
        repsCompleted: prev?.repsCompleted ?? ml.reps,
        rpe: prev?.rpe != null ? String(prev.rpe) : String(ml.targetRpe),
        hitAllReps: prev?.hitAllReps ?? true,
      };
    })
  );

  const [feedback, setFeedback] = useState(existing?.feedback ?? "");
  const [sleep, setSleep] = useState<Sleep | null>(existing?.sleep ?? null);
  const [accessories, setAccessories] = useState(existing?.accessoriesCompleted ?? true);

  function update(i: number, patch: Partial<LiftEntry>) {
    setLifts((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit(status: "completed" | "skipped") {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: session.date,
          focus: session.focus,
          status,
          accessoriesCompleted: accessories,
          feedback,
          sleep,
          lifts: lifts.map((l) => ({
            lift: l.lift,
            setsCompleted: l.setsPrescribed,
            setsPrescribed: l.setsPrescribed,
            repsCompleted: l.repsCompleted,
            repsPrescribed: l.repsPrescribed,
            weightKg: Number(l.weightKg),
            rpe: l.rpe === "" ? null : Number(l.rpe),
            hitAllReps: l.hitAllReps,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save");
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <>
      <section>
        {lifts.map((l, i) => (
          <div className="card" key={l.lift}>
            <div className="card-head">
              <h3>{liftLabel(l.lift)}</h3>
              <span className="tiny">
                Prescribed {l.setsPrescribed} × {l.repsPrescribed}
              </span>
            </div>

            <div className="stepper-grid">
              <Stepper
                label="Weight"
                value={l.weightKg}
                step={1.25}
                min={0}
                max={500}
                suffix="kg"
                onChange={(v) => update(i, { weightKg: v })}
              />
              <Stepper
                label="RPE"
                value={Number(l.rpe) || 0}
                step={0.5}
                min={1}
                max={10}
                onChange={(v) => update(i, { rpe: String(v) })}
              />
            </div>

            <div className="field">
              <span className="field-label">Reps done</span>
              <input
                type="text"
                inputMode="numeric"
                value={l.repsCompleted}
                onChange={(e) => update(i, { repsCompleted: e.target.value })}
              />
            </div>

            <div className="seg" role="group" aria-label="Did you get all the prescribed reps?">
              <button
                type="button"
                aria-pressed={l.hitAllReps}
                onClick={() => update(i, { hitAllReps: true })}
              >
                Got all reps
              </button>
              <button
                type="button"
                aria-pressed={!l.hitAllReps}
                onClick={() => update(i, { hitAllReps: false })}
              >
                Missed reps
              </button>
            </div>
            <p className="tiny">
              Whether you finished the work is the single most useful thing you log — it&apos;s
              what separates a hard session from too much volume.
            </p>
          </div>
        ))}
      </section>

      <section>
        <div className="card">
          <h3>How did it go?</h3>
          <label>
            In your own words
            <textarea
              value={feedback}
              placeholder="Anything worth knowing — how it felt, what was off, what went well."
              onChange={(e) => setFeedback(e.target.value)}
            />
          </label>

          <label style={{ marginTop: "0.4rem" }}>Sleep last night</label>
          <div className="seg" role="group" aria-label="Sleep last night">
            {(["poor", "okay", "good"] as Sleep[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sleep === s}
                onClick={() => setSleep(sleep === s ? null : s)}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <p className="tiny">
            This is what separates &ldquo;the programme is too much&rdquo; from &ldquo;you had four
            hours&rsquo; sleep&rdquo;. Without it, life stress gets mistaken for training stress.
          </p>

          <div className="seg" role="group" aria-label="Accessories" style={{ marginTop: "0.5rem" }}>
            <button type="button" aria-pressed={accessories} onClick={() => setAccessories(true)}>
              Accessories done
            </button>
            <button type="button" aria-pressed={!accessories} onClick={() => setAccessories(false)}>
              Skipped accessories
            </button>
          </div>
        </div>
      </section>

      {error && <div className="banner banner--warn">{error}</div>}

      <div className="row sticky-actions">
        <button type="button" onClick={() => submit("completed")} disabled={saving}>
          {saving ? "Saving…" : "Save session"}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => submit("skipped")}
          disabled={saving}
        >
          Mark skipped
        </button>
      </div>
    </>
  );
}
