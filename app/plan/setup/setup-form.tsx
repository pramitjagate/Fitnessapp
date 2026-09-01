"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { SPLITS, WEEKDAYS, splitFor, type SplitKey } from "@/lib/programme";

/* ---------------------------------------------------------------------------
 * The questions asked before a week is planned.
 *
 * Training days are picked as days, not as a count. "Four days a week" and
 * "Monday, Tuesday, Thursday, Friday" are not the same answer — the second one
 * can be put on a calendar. Rest days are shown as the ones left over rather
 * than asked for separately, because two answers to the same question is two
 * answers that can disagree.
 * ------------------------------------------------------------------------- */

const GOALS = [
  { value: "Get stronger on the main lifts", deficit: false },
  { value: "Build muscle", deficit: false },
  { value: "Build muscle while holding a small calorie deficit", deficit: true },
  { value: "Lose fat without losing strength", deficit: true },
];

const SUGGESTED: Record<SplitKey, string[]> = {
  full_body: ["Monday", "Wednesday", "Friday"],
  upper_lower: ["Monday", "Tuesday", "Thursday", "Friday"],
  push_pull_legs: ["Monday", "Wednesday", "Friday"],
  body_part: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  custom: ["Monday", "Wednesday", "Friday"],
};

export default function SetupForm({ firstRun }: { firstRun: boolean }) {
  const [splitKey, setSplitKey] = useState<SplitKey>("upper_lower");
  const [days, setDays] = useState<string[]>(SUGGESTED.upper_lower);
  const [goal, setGoal] = useState(GOALS[0].value);
  const [startNextWeek, setStartNextWeek] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const split = splitFor(splitKey);
  const rest = WEEKDAYS.filter((d) => !days.includes(d));
  const inDeficit = GOALS.find((g) => g.value === goal)?.deficit ?? false;

  function chooseSplit(key: SplitKey) {
    setSplitKey(key);
    // The suggested days move with the split, because "five days" on an
    // upper/lower split and on a body-part split are different weeks.
    setDays(SUGGESTED[key]);
  }

  function toggleDay(day: string) {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function save() {
    if (!days.length) {
      setError("Pick at least one training day.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/plan/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ splitKey, trainingDays: days, goal, inDeficit, startNextWeek }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save that.");
      router.push("/schedule");
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
          <h3>How do you train?</h3>
          <p className="tiny">
            Pick the split you follow. This decides what each day is for, not how hard it is.
          </p>
          <div className="split-list">
            {SPLITS.map((s) => (
              <button
                className={s.key === splitKey ? "split-option split-option--on" : "split-option"}
                key={s.key}
                onClick={() => chooseSplit(s.key)}
                type="button"
              >
                <strong>{s.label}</strong>
                <span className="tiny">{s.blurb}</span>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section>
        <article className="card">
          <h3>Which days do you train?</h3>
          <p className="tiny">
            Days, not a number — a week that can go on a calendar. Whatever you don&apos;t pick
            is a rest day.
          </p>
          <div className="day-grid">
            {WEEKDAYS.map((d) => (
              <button
                aria-pressed={days.includes(d)}
                className={days.includes(d) ? "day-chip day-chip--on" : "day-chip"}
                key={d}
                onClick={() => toggleDay(d)}
                type="button"
              >
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
          <p className="tiny">
            {days.length} training {days.length === 1 ? "day" : "days"} ·{" "}
            {rest.length} rest {rest.length === 1 ? "day" : "days"}
            {rest.length > 0 && ` (${rest.map((d) => d.slice(0, 3)).join(", ")})`}
          </p>
          {days.length > 5 && (
            <div className="banner banner--warn">
              <strong>Six or more days is a lot to recover from.</strong>
              <span>
                It can work, but the loop will spend most of its time telling you to hold.
                Adaptation happens on the rest days, not the training ones.
              </span>
            </div>
          )}
          {split.days.length > 0 && days.length > split.days.length && (
            <p className="tiny">
              You&apos;ve picked more days than this split has, so it repeats from the start —
              {" "}
              {days.length} days on a {split.days.length}-day rotation.
            </p>
          )}
        </article>
      </section>

      <section>
        <article className="card">
          <h3>What are you training for?</h3>
          <div className="field">
            <select onChange={(e) => setGoal(e.target.value)} value={goal}>
              {GOALS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.value}
                </option>
              ))}
            </select>
          </div>
          {inDeficit && (
            <p className="tiny">
              Eating in a deficit changes what success means: holding a load is the programme
              working, not stalling. The coach is told this, and it changes its decisions.
            </p>
          )}

          <div className="seg" role="group" aria-label="When to start">
            <button
              aria-pressed={!startNextWeek}
              onClick={() => setStartNextWeek(false)}
              type="button"
            >
              Start this week
            </button>
            <button
              aria-pressed={startNextWeek}
              onClick={() => setStartNextWeek(true)}
              type="button"
            >
              Start next week
            </button>
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
          <p className="tiny">
            No weights are prescribed in week one. The app has never seen you lift, and a
            number here would look exactly like one it had earned. You pick the loads, log
            what happened, and next week is built from that.
          </p>
          <button className="wide" disabled={busy} onClick={save} type="button">
            {busy ? "Building your week…" : firstRun ? "Build my first week" : "Replace my week"}
          </button>
        </article>
      </section>

      <section>
        <p className="tiny">
          Already follow a written programme?{" "}
          <Link href="/plan/new">Upload the PDF or type it in</Link> instead — it keeps your
          exercises exactly as written.
        </p>
      </section>
    </>
  );
}
