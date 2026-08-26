"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Recipe } from "@/lib/recipes";
import type { FoodEntry } from "@/lib/types";

interface Props {
  date: string;
  entries: FoodEntry[];
  recipes: Recipe[];
  targetKcal: number;
  targetProtein: number;
  latestWeight: number | null;
}

export default function FoodLog({
  date,
  entries,
  recipes,
  targetKcal,
  targetProtein,
  latestWeight,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState({ label: "", kcal: "", protein: "" });
  const [weight, setWeight] = useState(
    latestWeight ? String(latestWeight) : "",
  );
  const [weightSaved, setWeightSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const kcal = Math.round(entries.reduce((a, e) => a + e.kcal, 0));
  const protein = Math.round(entries.reduce((a, e) => a + e.protein, 0));

  async function add(body: Omit<FoodEntry, "id">) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok)
        throw new Error((await res.json()).error ?? "Could not add that.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    await fetch("/api/food", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBusy(false);
    router.refresh();
  }

  async function saveWeight() {
    const kg = Number(weight);
    if (!kg) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/weight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, kg }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not save that weight.");
      return;
    }
    setWeightSaved(true);
    router.refresh();
  }

  const bar = (value: number, target: number) =>
    Math.min(100, Math.round((value / target) * 100));
  // Over-target is worth seeing, not hiding — the overshoot rides past the bar.
  const over = (value: number, target: number) => value > target;

  return (
    <section>
      <div>
        <div className="eyebrow">Today</div>
        <h2>What you&apos;ve eaten</h2>
      </div>

      <article className="card">
        <div className="progress-pair">
          <div>
            <div className="progress-head">
              <span className="field-label">Calories</span>
              <span className="tiny">
                {kcal} / {targetKcal}
              </span>
            </div>
            <div className="bar-track">
              <div
                className={`bar-fill${over(kcal, targetKcal) ? " bar-fill--over" : ""}`}
                style={{ width: `${bar(kcal, targetKcal)}%` }}
              />
            </div>
            <p className="tiny">
              {kcal > targetKcal
                ? `${kcal - targetKcal} over`
                : `${targetKcal - kcal} left`}
            </p>
          </div>
          <div>
            <div className="progress-head">
              <span className="field-label">Protein</span>
              <span className="tiny">
                {protein} / {targetProtein}g
              </span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${bar(protein, targetProtein)}%` }}
              />
            </div>
            <p className="tiny">
              {protein >= targetProtein
                ? "Hit it"
                : `${targetProtein - protein}g short — the number to chase`}
            </p>
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="tiny">Nothing logged today.</p>
        ) : (
          <ul className="ingredients">
            {entries.map((e) => (
              <li key={e.id}>
                <span>{e.label}</span>
                <span className="row">
                  <span className="tiny">
                    {Math.round(e.kcal)} kcal · {Math.round(e.protein)}g P
                  </span>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => remove(e.id)}
                    disabled={busy}
                    aria-label={`Remove ${e.label}`}
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {error && <div className="banner banner--warn">{error}</div>}
      </article>

      <article className="card">
        <div className="card-head">
          <div>
            <h3>Add something</h3>
            <p className="tiny">
              Straight from the library, or type it. Two numbers is enough —
              calories and protein are what the loop reads.
            </p>
          </div>
        </div>

        <div className="chips">
          {recipes.slice(0, 6).map((r) => (
            <button
              type="button"
              key={r.id}
              className="pick"
              disabled={busy}
              onClick={() =>
                add({
                  date,
                  label: r.name,
                  kcal: r.kcal,
                  protein: r.protein,
                  carbs: r.carbs,
                  fat: r.fat,
                  source: "recipe",
                })
              }
            >
              + {r.name}
            </button>
          ))}
        </div>

        <form
          className="custom-add"
          onSubmit={(e) => {
            e.preventDefault();
            const k = Number(custom.kcal);
            const p = Number(custom.protein);
            if (!custom.label.trim() || !k) return;
            add({
              date,
              label: custom.label.trim(),
              kcal: k,
              protein: p || 0,
              carbs: 0,
              fat: 0,
              source: "custom",
            });
            setCustom({ label: "", kcal: "", protein: "" });
          }}
        >
          <input
            type="text"
            placeholder="Anything else"
            suppressHydrationWarning
            value={custom.label}
            onChange={(e) => setCustom({ ...custom, label: e.target.value })}
          />
          <input
            type="number"
            placeholder="kcal"
            min={0}
            suppressHydrationWarning
            value={custom.kcal}
            onChange={(e) => setCustom({ ...custom, kcal: e.target.value })}
          />
          <input
            type="number"
            placeholder="protein"
            min={0}
            suppressHydrationWarning
            value={custom.protein}
            onChange={(e) => setCustom({ ...custom, protein: e.target.value })}
          />
          <button type="submit" disabled={busy}>
            Add
          </button>
        </form>
      </article>

      <article className="card">
        <div className="card-head">
          <div>
            <h3>This morning&apos;s weight</h3>
            <p className="tiny">
              One reading a day, first thing. Any single number is mostly water
              — the loop only ever reads the fourteen-day trend, never today
              against yesterday.
            </p>
          </div>
        </div>
        <div className="row">
          <label className="mins">
            <input
              type="number"
              step="0.1"
              min={20}
              max={300}
              suppressHydrationWarning
              value={weight}
              onChange={(e) => {
                setWeight(e.target.value);
                setWeightSaved(false);
              }}
            />
            <span className="tiny">kg</span>
          </label>
          <button type="button" onClick={saveWeight} disabled={busy}>
            {weightSaved ? "Saved" : "Log weight"}
          </button>
        </div>
      </article>
    </section>
  );
}
