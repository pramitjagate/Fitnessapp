"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { liftLabel } from "@/app/components";
import { fillForward, topSet } from "@/lib/set-ramp";
import type { PlannedSession, LoggedSession, Sleep } from "@/lib/types";
import { displayToKg, kgToDisplay, weightStep, type Units } from "@/lib/units";

/*
 * Weights live in this form in the lifter's DISPLAY units and are converted
 * once, on the way out. The previous version converted on every keystroke and
 * back again on every render, which is how a 55lb set becomes 54.9.
 */
type LiftEntry = {
  lift: string;
  setsPrescribed: number;
  repsPrescribed: string;
  /** Used when every set is the same weight. */
  weight: number;
  /** Used when the lift is ramped. One entry per prescribed set. */
  setWeights: number[];
  /** Which of those the lifter set themselves — the rest are suggestions. */
  touched: boolean[];
  ramped: boolean;
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
  compact,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  suffix?: string;
  compact?: boolean;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  return (
    <div className={compact ? "stepper stepper--compact" : "stepper"}>
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
  units = "kg",
}: {
  session: PlannedSession;
  existing: LoggedSession | null;
  units?: Units;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = weightStep(units);
  const maxWeight = units === "lb" ? 1100 : 500;

  const [lifts, setLifts] = useState<LiftEntry[]>(() =>
    session.mainLifts.map((ml) => {
      const prev = existing?.lifts.find((l) => l.lift === ml.lift);
      // Prescribed values pre-fill so a session that went to plan is three
      // taps. You only edit what differed.
      const weight = kgToDisplay(prev?.weightKg ?? ml.weightKg ?? 0, units);
      const saved = prev?.setWeightsKg?.map((kg) => kgToDisplay(kg, units));
      const sets = ml.sets;

      return {
        lift: ml.lift,
        setsPrescribed: sets,
        repsPrescribed: ml.reps,
        weight,
        setWeights: saved ?? Array.from({ length: sets }, (_, i) => (i === 0 ? weight : 0)),
        // Everything reloaded from a saved session is the lifter's, not a guess.
        touched: saved ? saved.map(() => true) : Array.from({ length: sets }, (_, i) => i === 0),
        ramped: Boolean(saved?.length),
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

  /** One set changed: record it as the lifter's, then re-propose the ones after it. */
  function setSetWeight(i: number, setIndex: number, value: number) {
    setLifts((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l;
        const weights = l.setWeights.slice();
        const touched = l.touched.slice();
        weights[setIndex] = value;
        touched[setIndex] = true;
        return { ...l, touched, setWeights: fillForward(weights, touched, step, maxWeight) };
      })
    );
  }

  /** Switching to ramped seeds set one from the flat weight and proposes the rest. */
  function setRamped(i: number, ramped: boolean) {
    setLifts((prev) =>
      prev.map((l, idx) => {
        if (idx !== i || l.ramped === ramped) return l;
        if (!ramped) return { ...l, ramped: false, weight: topSet(l.setWeights) || l.weight };
        const touched = Array.from({ length: l.setsPrescribed }, (_, k) => k === 0);
        const weights = Array.from({ length: l.setsPrescribed }, (_, k) =>
          k === 0 ? l.weight : 0
        );
        return { ...l, ramped: true, touched, setWeights: fillForward(weights, touched, step, maxWeight) };
      })
    );
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
            // The top set is what goes in weightKg — see topSet() for why it
            // is not an average.
            weightKg: displayToKg(l.ramped ? topSet(l.setWeights) : l.weight, units),
            setWeightsKg: l.ramped ? l.setWeights.map((w) => displayToKg(w, units)) : undefined,
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

            <div className="seg" role="group" aria-label="How the sets were loaded">
              <button type="button" aria-pressed={!l.ramped} onClick={() => setRamped(i, false)}>
                Same every set
              </button>
              <button type="button" aria-pressed={l.ramped} onClick={() => setRamped(i, true)}>
                Weight per set
              </button>
            </div>

            {l.ramped ? (
              <>
                <div className="set-list">
                  {l.setWeights.map((w, k) => (
                    <div className="set-row" key={k}>
                      <Stepper
                        compact
                        label={`Set ${k + 1}`}
                        value={w}
                        step={step}
                        min={0}
                        max={maxWeight}
                        suffix={units}
                        onChange={(v) => setSetWeight(i, k, v)}
                      />
                      {!l.touched[k] && <span className="chip chip--suggested">suggested</span>}
                    </div>
                  ))}
                </div>
                <p className="tiny">
                  Anything marked <em>suggested</em> is the app continuing your own jump — 50 then
                  55 proposes 60, and 60 then 60 proposes 60. It is a filled-in field, not a
                  record: change any of them and the ones after it follow. Top set{" "}
                  {topSet(l.setWeights)}
                  {units} is what the progression reads.
                </p>
              </>
            ) : (
              <div className="stepper-grid">
                <Stepper
                  label="Weight"
                  value={l.weight}
                  step={step}
                  min={0}
                  max={maxWeight}
                  suffix={units}
                  onChange={(v) => update(i, { weight: v })}
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
            )}

            {l.ramped && (
              <div className="stepper-grid">
                <Stepper
                  label="RPE"
                  value={Number(l.rpe) || 0}
                  step={0.5}
                  min={1}
                  max={10}
                  onChange={(v) => update(i, { rpe: String(v) })}
                />
              </div>
            )}

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
          <p className="tiny">
            Accessories are everything on the day that isn&apos;t one of the five tracked barbell
            lifts — curls, lateral raises, cable rows, leg press. They&apos;re logged as done or
            not done rather than set by set, because the weekly decision is driven by the main
            lifts and one more field per curl is how a log stops getting filled in.
          </p>
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
