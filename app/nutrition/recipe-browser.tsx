"use client";

import { useMemo, useState } from "react";
import type { Recipe, RecipeKind } from "@/lib/recipes";

const KINDS: { value: RecipeKind | "all"; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "meal", label: "Meals" },
  { value: "shake", label: "Shakes" },
  { value: "snack", label: "Snacks" },
];

export default function RecipeBrowser({
  recipes,
  proteinTarget,
}: {
  recipes: Recipe[];
  proteinTarget: number;
}) {
  const [kind, setKind] = useState<RecipeKind | "all">("all");
  const [vegOnly, setVegOnly] = useState(false);
  const [quickOnly, setQuickOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const shown = useMemo(
    () =>
      recipes
        .filter(
          (r) =>
            (kind === "all" || r.kind === kind) &&
            (!vegOnly || r.vegetarian) &&
            (!quickOnly || r.minutes <= 10)
        )
        // Protein per 100 kcal, not raw protein: the useful question on a
        // deficit is how much of the day's budget a meal spends to get there.
        .sort((a, b) => b.proteinDensity - a.proteinDensity),
    [recipes, kind, vegOnly, quickOnly]
  );

  return (
    <section>
      <div>
        <div className="eyebrow">Hitting it</div>
        <h2>High-protein food</h2>
      </div>
      <p className="muted">
        Sorted by protein per 100 kcal — how much of the day&apos;s budget each one spends to
        get there. Every macro is computed from an ingredient table rather than typed in, so a
        recipe can&apos;t disagree with itself.
      </p>

      <div className="chips">
        {KINDS.map((k) => (
          <button
            type="button"
            key={k.value}
            className={`pick${kind === k.value ? " pick--on" : ""}`}
            aria-pressed={kind === k.value}
            onClick={() => setKind(k.value)}
          >
            {k.label}
          </button>
        ))}
        <button
          type="button"
          className={`pick${vegOnly ? " pick--on" : ""}`}
          aria-pressed={vegOnly}
          onClick={() => setVegOnly((v) => !v)}
        >
          Vegetarian
        </button>
        <button
          type="button"
          className={`pick${quickOnly ? " pick--on" : ""}`}
          aria-pressed={quickOnly}
          onClick={() => setQuickOnly((v) => !v)}
        >
          Under 10 min
        </button>
      </div>

      {shown.length === 0 && (
        <div className="banner banner--warn">
          Nothing matches all three filters. Drop one.
        </div>
      )}

      {shown.map((r) => {
        const isOpen = open === r.id;
        const share = Math.round((r.protein / proteinTarget) * 100);
        return (
          <article className="card" key={r.id}>
            <div className="card-head">
              <div>
                <div className="eyebrow">
                  {r.kind} · {r.minutes} min{r.vegetarian ? " · vegetarian" : ""}
                </div>
                <h3>{r.name}</h3>
              </div>
              <span className="chip chip--today">{r.protein}g protein</span>
            </div>

            <p className="tiny">{r.note}</p>

            <div className="macro-row">
              <span>
                <strong>{r.kcal}</strong> kcal
              </span>
              <span>
                <strong>{r.protein}</strong>g protein
              </span>
              <span>
                <strong>{r.carbs}</strong>g carbs
              </span>
              <span>
                <strong>{r.fat}</strong>g fat
              </span>
              <span className="tiny">{r.proteinDensity}g per 100 kcal</span>
            </div>

            <div className="bar-track" aria-hidden="true">
              <div className="bar-fill" style={{ width: `${Math.min(100, share)}%` }} />
            </div>
            <p className="tiny">{share}% of today&apos;s protein target in one go.</p>

            <button
              type="button"
              className="btn btn--ghost self-start"
              onClick={() => setOpen(isOpen ? null : r.id)}
              aria-expanded={isOpen}
            >
              {isOpen ? "Hide" : "How to make it"}
            </button>

            {isOpen && (
              <div className="recipe-body">
                <ul className="ingredients">
                  {r.ingredients.map((i) => (
                    <li key={i.label}>
                      <span>{i.label}</span>
                      <span className="tiny">{i.grams}g</span>
                    </li>
                  ))}
                </ul>
                <ol className="steps">
                  {r.method.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ol>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
