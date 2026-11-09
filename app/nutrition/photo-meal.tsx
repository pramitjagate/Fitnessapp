"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { MealEstimate, MealItem } from "@/lib/meal-photo";

/** Long edge in pixels. Enough to read a plate; a phone's 12MP is just slower and dearer. */
const MAX_EDGE = 1280;

/**
 * Shrink and re-encode in the browser. Phone photos are 3–8MB and the API caps
 * images at 5MB, and a 1280px JPEG reads a plate just as well. Re-encoding also
 * drops EXIF, so the photo's GPS location never leaves the phone.
 */
async function toJpeg(file: File): Promise<{ data: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const preview = canvas.toDataURL("image/jpeg", 0.85);
  return { data: preview.slice(preview.indexOf(",") + 1), preview };
}

type Row = MealItem & { keep: boolean };

export default function PhotoMeal({ date }: { date: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ data: string; preview: string } | null>(null);
  const [hint, setHint] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [meta, setMeta] = useState<Pick<MealEstimate, "confidence" | "notes"> | null>(null);
  const [busy, setBusy] = useState<"reading" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPhoto(null);
    setHint("");
    setRows(null);
    setMeta(null);
    setError(null);
    if (input.current) input.current.value = "";
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    reset();
    try {
      setPhoto(await toJpeg(file));
    } catch {
      setError("That image couldn't be opened. Try a JPEG or PNG.");
    }
  }

  async function analyse() {
    if (!photo) return;
    setBusy("reading");
    setError(null);
    try {
      const res = await fetch("/api/food/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: photo.data, mediaType: "image/jpeg", hint }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't analyse that photo.");
      const estimate = body.estimate as MealEstimate;
      if (!estimate.isFood || estimate.items.length === 0) {
        throw new Error("No food found in that photo. Try a clearer shot of the plate.");
      }
      setRows(estimate.items.map((i) => ({ ...i, keep: true })));
      setMeta({ confidence: estimate.confidence, notes: estimate.notes });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function edit(i: number, patch: Partial<Row>) {
    setRows((prev) => prev && prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function addAll() {
    const kept = (rows ?? []).filter((r) => r.keep && r.label.trim());
    if (kept.length === 0) return;
    setBusy("saving");
    setError(null);
    try {
      for (const r of kept) {
        const res = await fetch("/api/food", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            label: r.label.trim(),
            kcal: r.kcal,
            protein: r.protein,
            carbs: r.carbs,
            fat: r.fat,
            source: "photo",
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? `Couldn't add ${r.label}.`);
      }
      reset();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const kept = (rows ?? []).filter((r) => r.keep);
  const total = (k: "kcal" | "protein" | "carbs" | "fat") =>
    kept.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h3>Snap a meal</h3>
          <p className="tiny">
            Take or pick a photo and get an estimate to check before it&apos;s logged. Portions
            from a photo are a guess, so fix anything that looks off. The photo isn&apos;t kept.
          </p>
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {!photo ? (
        <div className="row">
          <button type="button" onClick={() => input.current?.click()}>
            📷 Add a photo
          </button>
        </div>
      ) : (
        <div className="meal-photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing to optimise */}
          <img src={photo.preview} alt="Your meal" className="meal-preview" />

          {!rows && (
            <>
              <label>
                Anything the photo can&apos;t show? <span className="tiny">(optional)</span>
                <input
                  type="text"
                  maxLength={300}
                  placeholder="e.g. 200g chicken, cooked in a tbsp of olive oil"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                />
              </label>
              <div className="row">
                <button type="button" onClick={analyse} disabled={busy !== null}>
                  {busy === "reading" ? "Reading the plate…" : "Estimate"}
                </button>
                <button type="button" className="btn btn--ghost" onClick={reset} disabled={busy !== null}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {rows && meta && (
            <>
              <div className="card-head">
                <span className="field-label">What it saw</span>
                <span className={`chip chip--conf-${meta.confidence}`}>
                  {meta.confidence} confidence
                </span>
              </div>
              {meta.notes && <p className="tiny">{meta.notes}</p>}

              <div className="meal-rows">
                {rows.map((r, i) => (
                  <div className={r.keep ? "meal-row" : "meal-row meal-row--off"} key={i}>
                    <div className="meal-row-head">
                      <input
                        type="text"
                        aria-label="Food"
                        value={r.label}
                        onChange={(e) => edit(i, { label: e.target.value })}
                      />
                      <button
                        type="button"
                        className="link-btn"
                        aria-label={r.keep ? `Leave out ${r.label}` : `Include ${r.label}`}
                        onClick={() => edit(i, { keep: !r.keep })}
                      >
                        {r.keep ? "×" : "↺"}
                      </button>
                    </div>
                    <div className="meal-macros">
                      {(
                        [
                          ["kcal", "kcal"],
                          ["protein", "P g"],
                          ["carbs", "C g"],
                          ["fat", "F g"],
                        ] as const
                      ).map(([k, label]) => (
                        <label key={k}>
                          <span className="tiny">{label}</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={r[k]}
                            disabled={!r.keep}
                            onChange={(e) => edit(i, { [k]: num(e.target.value) })}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <p className="macro-row">
                <span>
                  <strong>{total("kcal")}</strong> kcal
                </span>
                <span>
                  <strong>{total("protein")}</strong>g protein
                </span>
                <span>
                  <strong>{total("carbs")}</strong>g carbs
                </span>
                <span>
                  <strong>{total("fat")}</strong>g fat
                </span>
              </p>

              <div className="row">
                <button type="button" onClick={addAll} disabled={busy !== null || kept.length === 0}>
                  {busy === "saving" ? "Adding…" : `Add ${kept.length === 1 ? "it" : `all ${kept.length}`} to today`}
                </button>
                <button type="button" className="btn btn--ghost" onClick={reset} disabled={busy !== null}>
                  Discard
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {error && <div className="banner banner--warn">{error}</div>}
    </article>
  );
}
