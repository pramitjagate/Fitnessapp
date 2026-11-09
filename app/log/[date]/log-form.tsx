"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { liftLabel } from "@/app/components";
import { fillForward, topSet } from "@/lib/set-ramp";
import type {
  LoggedAccessory,
  LoggedLift,
  PlannedSession,
  LoggedSession,
  Sleep,
} from "@/lib/types";
import { displayToKg, kgToDisplay, weightStep, type Units } from "@/lib/units";

/*
 * Weights live in this form in the lifter's DISPLAY units and are converted
 * once, on the way out. The previous version converted on every keystroke and
 * back again on every render, which is how a 55lb set becomes 54.9.
 */

/** How a lift or accessory was loaded. Shared so both get "weight per set". */
type Load = {
  /** Used when every set is the same weight. */
  weight: number;
  /** Used when the lift is ramped. One entry per set. */
  setWeights: number[];
  /** Which of those the lifter set themselves — the rest are suggestions. */
  touched: boolean[];
  ramped: boolean;
  /** True when the numbers came from last week rather than the plan or a blank. */
  carried: boolean;
};

type LiftEntry = {
  lift: string;
  setsPrescribed: number;
  repsPrescribed: string;
  load: Load;
  repsCompleted: string;
  rpe: string;
  hitAllReps: boolean;
};

/** An accessory in the form. Weight 0 means bodyweight, stored as null. */
type AccessoryEntry = {
  exercise: string;
  setsPrescribed: number;
  repsPrescribed: string;
  sets: number;
  load: Load;
  repsCompleted: string;
  done: boolean;
};

function flatLoad(weight: number, sets: number, carried = false): Load {
  return {
    weight,
    setWeights: Array.from({ length: sets }, (_, i) => (i === 0 ? weight : 0)),
    touched: Array.from({ length: sets }, (_, i) => i === 0),
    ramped: false,
    carried,
  };
}

/** Per-set weights that are real numbers, not guesses — a save, or last week's sets. */
function rampedLoad(weights: number[], carried = false): Load {
  return {
    weight: topSet(weights),
    setWeights: weights,
    touched: weights.map(() => true),
    ramped: true,
    carried,
  };
}

function loadTop(l: Load): number {
  return l.ramped ? topSet(l.setWeights) : l.weight;
}

/**
 * The starting load for a set count, from (in order) this session's own save,
 * the last time it was done, or a fallback weight. Last time's ramp only
 * carries over when the set count matches — five sets of last week's three
 * would be inventing two.
 */
function startingLoad(
  saved: { weightKg: number | null; setWeightsKg?: number[] } | undefined,
  previous: { weightKg: number | null; setWeightsKg?: number[] } | undefined,
  sets: number,
  fallbackKg: number | null,
  units: Units,
  /** Added to every carried set, so last week's ramp lands on this week's top set. */
  shiftKg = 0
): Load {
  const show = (kg: number) => kgToDisplay(Math.max(0, kg), units);
  if (saved) {
    if (saved.setWeightsKg?.length) return rampedLoad(saved.setWeightsKg.map(show));
    return flatLoad(show(saved.weightKg ?? 0), sets);
  }
  if (previous) {
    if (previous.setWeightsKg?.length === sets) {
      return rampedLoad(previous.setWeightsKg.map((kg) => show(kg + shiftKg)), true);
    }
    if (fallbackKg === null && previous.weightKg !== null) {
      return flatLoad(show(previous.weightKg), sets, true);
    }
  }
  return flatLoad(show(fallbackKg ?? 0), sets);
}

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

/**
 * "Same every set" or "Weight per set", for any exercise. `children` are the
 * steppers that sit beside the weight — RPE for a main lift, sets for an
 * accessory.
 */
function LoadInput({
  load,
  units,
  step,
  max,
  explain,
  onChange,
  children,
}: {
  load: Load;
  units: Units;
  step: number;
  max: number;
  /** The long note about suggestions — main lifts only, where the top set matters. */
  explain?: boolean;
  onChange: (l: Load) => void;
  children?: ReactNode;
}) {
  /** One set changed: record it as the lifter's, then re-propose the ones after it. */
  function setSet(k: number, value: number) {
    const weights = load.setWeights.slice();
    const touched = load.touched.slice();
    weights[k] = value;
    touched[k] = true;
    onChange({ ...load, touched, setWeights: fillForward(weights, touched, step, max) });
  }

  /** Switching to ramped seeds set one from the flat weight and proposes the rest. */
  function setRamped(ramped: boolean) {
    if (load.ramped === ramped) return;
    if (!ramped) {
      onChange({ ...load, ramped: false, weight: topSet(load.setWeights) || load.weight });
      return;
    }
    const n = load.setWeights.length;
    const touched = Array.from({ length: n }, (_, k) => k === 0);
    const weights = Array.from({ length: n }, (_, k) => (k === 0 ? load.weight : 0));
    onChange({ ...load, ramped: true, touched, setWeights: fillForward(weights, touched, step, max) });
  }

  return (
    <>
      <div className="seg" role="group" aria-label="How the sets were loaded">
        <button type="button" aria-pressed={!load.ramped} onClick={() => setRamped(false)}>
          Same every set
        </button>
        <button type="button" aria-pressed={load.ramped} onClick={() => setRamped(true)}>
          Weight per set
        </button>
      </div>

      {load.ramped ? (
        <>
          <div className="set-list">
            {load.setWeights.map((w, k) => (
              <div className="set-row" key={k}>
                <Stepper
                  compact
                  label={`Set ${k + 1}`}
                  value={w}
                  step={step}
                  min={0}
                  max={max}
                  suffix={units}
                  onChange={(v) => setSet(k, v)}
                />
                {!load.touched[k] && <span className="chip chip--suggested">suggested</span>}
              </div>
            ))}
          </div>
          {explain && (
            <p className="tiny">
              Anything marked <em>suggested</em> is the app continuing your own jump — 50 then 55
              proposes 60, and 60 then 60 proposes 60. It is a filled-in field, not a record:
              change any of them and the ones after it follow. Top set {topSet(load.setWeights)}
              {units} is what the progression reads.
            </p>
          )}
          {children && <div className="stepper-grid">{children}</div>}
        </>
      ) : (
        <div className="stepper-grid">
          <Stepper
            label="Weight"
            value={load.weight}
            step={step}
            min={0}
            max={max}
            suffix={units}
            onChange={(v) => onChange({ ...load, weight: v })}
          />
          {children}
        </div>
      )}

      {load.carried && <p className="tiny">Carried over from last time.</p>}
    </>
  );
}

export default function LogForm({
  session,
  existing,
  lastLift = {},
  lastAccessory = {},
  units = "kg",
}: {
  session: PlannedSession;
  existing: LoggedSession | null;
  /** Most recent log of each main lift before this session. */
  lastLift?: Record<string, LoggedLift>;
  /** Most recent log of each accessory, keyed by lower-cased exercise name. */
  lastAccessory?: Record<string, LoggedAccessory>;
  units?: Units;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = weightStep(units);
  const maxWeight = units === "lb" ? 1100 : 500;

  const [lifts, setLifts] = useState<LiftEntry[]>(() =>
    session.mainLifts.map((ml) => {
      const saved = existing?.lifts.find((l) => l.lift === ml.lift);
      const prev = lastLift[ml.lift];
      // Prescribed values pre-fill so a session that went to plan is three
      // taps. If last week was ramped, the same ramp comes back, moved so its
      // top set is this week's prescription — the coach decides the top set,
      // your warm-up pattern is yours.
      const shift = prev && ml.weightKg !== null ? ml.weightKg - prev.weightKg : 0;
      return {
        lift: ml.lift,
        setsPrescribed: ml.sets,
        repsPrescribed: ml.reps,
        load: startingLoad(saved, prev, ml.sets, ml.weightKg, units, shift),
        repsCompleted: saved?.repsCompleted ?? ml.reps,
        rpe: saved?.rpe != null ? String(saved.rpe) : String(ml.targetRpe),
        hitAllReps: saved?.hitAllReps ?? true,
      };
    })
  );

  const [feedback, setFeedback] = useState(existing?.feedback ?? "");
  const [sleep, setSleep] = useState<Sleep | null>(existing?.sleep ?? null);
  const [accessories, setAccessories] = useState<AccessoryEntry[]>(() =>
    session.accessories.map((a) => {
      // This session's own save first, then the last time you did it.
      const saved = existing?.accessories?.find((e) => e.exercise === a.exercise);
      const prev = lastAccessory[a.exercise.toLowerCase()];
      const sets = saved?.setsCompleted || a.sets;
      return {
        exercise: a.exercise,
        setsPrescribed: a.sets,
        repsPrescribed: a.reps,
        sets,
        load: startingLoad(saved, prev, sets, null, units),
        repsCompleted: saved?.repsCompleted ?? a.reps,
        done: saved?.done ?? existing?.accessoriesCompleted ?? true,
      };
    })
  );

  function update(i: number, patch: Partial<LiftEntry>) {
    setLifts((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function updateAccessory(i: number, patch: Partial<AccessoryEntry>) {
    setAccessories((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  /** Changing an accessory's set count grows or trims its per-set weights to match. */
  function setAccessorySets(i: number, sets: number) {
    setAccessories((prev) =>
      prev.map((a, idx) => {
        if (idx !== i) return a;
        const n = Math.max(1, sets);
        const weights = Array.from({ length: n }, (_, k) => a.load.setWeights[k] ?? 0);
        const touched = Array.from({ length: n }, (_, k) => a.load.touched[k] ?? false);
        return {
          ...a,
          sets,
          load: { ...a.load, touched, setWeights: fillForward(weights, touched, step, maxWeight) },
        };
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
          accessoriesCompleted: accessories.every((a) => a.done),
          accessories: accessories.map((a) => {
            const top = loadTop(a.load);
            return {
              exercise: a.exercise,
              setsCompleted: a.done ? a.sets : 0,
              repsCompleted: a.repsCompleted,
              weightKg: top > 0 ? displayToKg(top, units) : null,
              setWeightsKg: a.load.ramped
                ? a.load.setWeights.map((w) => displayToKg(w, units))
                : undefined,
              done: a.done,
            };
          }),
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
            weightKg: displayToKg(loadTop(l.load), units),
            setWeightsKg: l.load.ramped
              ? l.load.setWeights.map((w) => displayToKg(w, units))
              : undefined,
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

            <LoadInput
              load={l.load}
              units={units}
              step={step}
              max={maxWeight}
              explain
              onChange={(load) => update(i, { load })}
            >
              <Stepper
                label="RPE"
                value={Number(l.rpe) || 0}
                step={0.5}
                min={1}
                max={10}
                onChange={(v) => update(i, { rpe: String(v) })}
              />
            </LoadInput>

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

      {accessories.length > 0 && (
        <section>
          <h2>Accessories</h2>
          {accessories.map((a, i) => (
            <div className={a.done ? "card" : "card card--muted"} key={a.exercise}>
              <div className="card-head">
                <h3>{a.exercise}</h3>
                <span className="tiny">
                  Prescribed {a.setsPrescribed} × {a.repsPrescribed}
                </span>
              </div>

              <div className="seg" role="group" aria-label={`Did you do ${a.exercise}?`}>
                <button
                  type="button"
                  aria-pressed={a.done}
                  onClick={() => updateAccessory(i, { done: true })}
                >
                  Done
                </button>
                <button
                  type="button"
                  aria-pressed={!a.done}
                  onClick={() => updateAccessory(i, { done: false })}
                >
                  Skipped
                </button>
              </div>

              {a.done && (
                <>
                  <LoadInput
                    load={a.load}
                    units={units}
                    step={step}
                    max={maxWeight}
                    onChange={(load) => updateAccessory(i, { load })}
                  >
                    <Stepper
                      label="Sets"
                      value={a.sets}
                      step={1}
                      min={1}
                      max={20}
                      onChange={(v) => setAccessorySets(i, v)}
                    />
                  </LoadInput>
                  <div className="field">
                    <span className="field-label">Reps done</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={a.repsCompleted}
                      onChange={(e) => updateAccessory(i, { repsCompleted: e.target.value })}
                    />
                  </div>
                </>
              )}
            </div>
          ))}
          <p className="tiny">
            Leave weight at 0 for bodyweight work like dips or push-ups. Whatever you save here
            fills in next time, per set if you ramped.
          </p>
        </section>
      )}

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
