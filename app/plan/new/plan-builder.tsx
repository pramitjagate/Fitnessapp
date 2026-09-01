"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DAY_NAMES, liftFor, type DraftDay, type DraftExercise, type PlanDraft } from "@/lib/plan-import";
import { LIFTS } from "@/lib/types";

/* ---------------------------------------------------------------------------
 * Two ways in, one way out.
 *
 * Uploading a file does not save a plan — it fills this form in. Every import
 * lands in the same editable draft as a manually typed one, and the Save button
 * is the only thing that writes. That is deliberate: a parser is a suggestion,
 * and the difference between a suggestion and a prescription is whether anyone
 * looked at it.
 * ------------------------------------------------------------------------- */

const EMPTY_EXERCISE: DraftExercise = { name: "", sets: 3, reps: "8-10", lift: null };

function emptyDraft(): PlanDraft {
  return {
    name: "My plan",
    goal: "",
    progressionRule: "",
    notes: "",
    source: "manual",
    days: [{ day: "Monday", focus: "", exercises: [{ ...EMPTY_EXERCISE }], note: "" }],
  };
}

export default function PlanBuilder({ mondayIso, nextMondayIso }: { mondayIso: string; nextMondayIso: string }) {
  const [tab, setTab] = useState<"upload" | "manual">("upload");
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [weekStart, setWeekStart] = useState(nextMondayIso);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function edit(patch: Partial<PlanDraft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  function editDay(index: number, patch: Partial<DraftDay>) {
    setDraft((d) =>
      d ? { ...d, days: d.days.map((day, i) => (i === index ? { ...day, ...patch } : day)) } : d
    );
  }

  function editExercise(dayIndex: number, exIndex: number, patch: Partial<DraftExercise>) {
    setDraft((d) =>
      d
        ? {
            ...d,
            days: d.days.map((day, i) =>
              i !== dayIndex
                ? day
                : {
                    ...day,
                    exercises: day.exercises.map((ex, j) => (j === exIndex ? { ...ex, ...patch } : ex)),
                  }
            ),
          }
        : d
    );
  }

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/plan/parse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not read that file.");
      setDraft(data.draft as PlanDraft);
      setStatus(
        `Read ${data.draft.days.length} training days${
          data.draft.source === "rules" ? " with the keyword parser" : ""
        }. Check every line below before saving — nothing has been saved yet.`
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    const blank = draft.days.some((d) => d.exercises.some((e) => !e.name.trim()));
    if (blank) {
      setError("One of the exercises has no name. Fill it in or remove the row.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, weekStart }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the plan.");
      setStatus(`Saved — ${data.sessions} sessions from ${data.weekStart}.`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section>
        <div className="segmented" role="tablist">
          <button
            className={tab === "upload" ? "segmented-item segmented-item--on" : "segmented-item"}
            onClick={() => setTab("upload")}
            role="tab"
            type="button"
          >
            Upload a file
          </button>
          <button
            className={tab === "manual" ? "segmented-item segmented-item--on" : "segmented-item"}
            onClick={() => {
              setTab("manual");
              if (!draft) setDraft(emptyDraft());
            }}
            role="tab"
            type="button"
          >
            Build manually
          </button>
        </div>

        {tab === "upload" && (
          <article className="card">
            <h3>Upload your programme</h3>
            <p className="tiny">
              PDF, DOCX, TXT or MD, up to 5MB. A scan or a photo of a page won&apos;t work — there
              is no text in it to read. Nothing is saved until you have read the draft yourself.
            </p>
            <input accept=".pdf,.docx,.txt,.md" className="file-input" ref={fileRef} type="file" />
            <button className="btn" disabled={busy} onClick={upload} type="button">
              {busy ? "Reading…" : "Read the file"}
            </button>
          </article>
        )}
      </section>

      {error && (
        <section>
          <div className="banner banner--warn">{error}</div>
        </section>
      )}
      {status && (
        <section>
          <div className="banner">{status}</div>
        </section>
      )}

      {draft && (
        <>
          <section>
            <article className="card">
              <div className="field">
                <label className="field-label">Plan name</label>
                <input onChange={(e) => edit({ name: e.target.value })} type="text" value={draft.name} />
              </div>
              <div className="field">
                <label className="field-label">Goal</label>
                <input onChange={(e) => edit({ goal: e.target.value })} type="text" value={draft.goal} />
              </div>
              <div className="field">
                <label className="field-label">Progression rule</label>
                <p className="tiny">
                  How the plan says to add weight. The adaptation loop reads this when it decides
                  whether a lift moves up.
                </p>
                <input
                  onChange={(e) => edit({ progressionRule: e.target.value })}
                  type="text"
                  value={draft.progressionRule}
                />
              </div>
              <div className="field">
                <label className="field-label">Notes</label>
                <textarea
                  onChange={(e) => edit({ notes: e.target.value })}
                  rows={3}
                  value={draft.notes}
                />
              </div>
            </article>
          </section>

          {draft.days.map((day, i) => (
            <section key={i}>
              <article className="card">
                <div className="plan-day-head">
                  <select
                    onChange={(e) => editDay(i, { day: e.target.value })}
                    value={day.day}
                  >
                    {DAY_NAMES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <input
                    onChange={(e) => editDay(i, { focus: e.target.value })}
                    placeholder="Focus — chest and triceps"
                    type="text"
                    value={day.focus}
                  />
                  <button
                    className="btn btn--ghost"
                    onClick={() => edit({ days: draft.days.filter((_, j) => j !== i) })}
                    type="button"
                  >
                    Remove day
                  </button>
                </div>

                {day.exercises.map((ex, j) => (
                  <div className="plan-ex-row" key={j}>
                    <input
                      onChange={(e) =>
                        editExercise(i, j, { name: e.target.value, lift: liftFor(e.target.value) })
                      }
                      placeholder="Exercise"
                      type="text"
                      value={ex.name}
                    />
                    <input
                      max={10}
                      min={1}
                      onChange={(e) => editExercise(i, j, { sets: Number(e.target.value) || 1 })}
                      type="number"
                      value={ex.sets}
                    />
                    <input
                      onChange={(e) => editExercise(i, j, { reps: e.target.value })}
                      placeholder="reps"
                      type="text"
                      value={ex.reps}
                    />
                    <select
                      onChange={(e) =>
                        editExercise(i, j, {
                          lift: e.target.value === "" ? null : (e.target.value as DraftExercise["lift"]),
                        })
                      }
                      value={ex.lift ?? ""}
                    >
                      <option value="">Accessory</option>
                      {LIFTS.filter((l) => l !== "other").map((l) => (
                        <option key={l} value={l}>
                          {l.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                    <button
                      aria-label="Remove exercise"
                      className="btn btn--ghost"
                      onClick={() =>
                        editDay(i, { exercises: day.exercises.filter((_, k) => k !== j) })
                      }
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}

                <button
                  className="btn btn--ghost"
                  onClick={() => editDay(i, { exercises: [...day.exercises, { ...EMPTY_EXERCISE }] })}
                  type="button"
                >
                  Add exercise
                </button>
                <p className="tiny">
                  Exercises marked as one of the five tracked lifts are what the weekly adaptation
                  reads. Everything else is an accessory: logged, not progressed automatically.
                </p>
              </article>
            </section>
          ))}

          <section>
            <button
              className="btn btn--ghost"
              onClick={() =>
                edit({
                  days: [
                    ...draft.days,
                    {
                      day: DAY_NAMES.find((d) => !draft.days.some((x) => x.day === d)) ?? "Saturday",
                      focus: "",
                      exercises: [{ ...EMPTY_EXERCISE }],
                      note: "",
                    },
                  ],
                })
              }
              type="button"
            >
              Add a day
            </button>
          </section>

          <section>
            <article className="card">
              <div className="field">
                <label className="field-label">Start the plan from</label>
                <p className="tiny">
                  Saving replaces the current week&apos;s plan. Loads come through empty — an
                  imported programme prescribes movements and rep ranges, not the weight on your
                  bar.
                </p>
                <select onChange={(e) => setWeekStart(e.target.value)} value={weekStart}>
                  <option value={mondayIso}>This week ({mondayIso})</option>
                  <option value={nextMondayIso}>Next week ({nextMondayIso})</option>
                </select>
              </div>
              <button className="btn" disabled={busy} onClick={save} type="button">
                {busy ? "Saving…" : "Save this plan"}
              </button>
            </article>
          </section>
        </>
      )}
    </>
  );
}
