"use client";

import { useState } from "react";
import { GENRES, type MusicPrefs } from "@/lib/types";

const FAMILIARITY: { value: MusicPrefs["familiarity"]; label: string; hint: string }[] = [
  { value: "known", label: "Songs I know", hint: "Nothing unfamiliar mid-set." },
  { value: "mixed", label: "Mixed", hint: "Mostly known, some new." },
  { value: "discovery", label: "Mostly new", hint: "Find me things I haven't heard." },
];

/** Comma or Enter commits a tag; backspace on an empty field removes the last. */
function TagInput({
  label,
  hint,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  hint: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const name = draft.trim();
    if (!name) return;
    // Case-insensitive dedupe: "Travis Scott" and "travis scott" in the same
    // prompt reads as emphasis to a model, which isn't what was meant.
    if (!values.some((v) => v.toLowerCase() === name.toLowerCase())) onChange([...values, name]);
    setDraft("");
  }

  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <p className="tiny">{hint}</p>
      <div className="tags">
        {values.map((v) => (
          <button
            type="button"
            className="tag"
            key={v}
            onClick={() => onChange(values.filter((x) => x !== v))}
            aria-label={`Remove ${v}`}
          >
            {v} <span className="tag-x">×</span>
          </button>
        ))}
      </div>
      <div className="row">
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
        />
        <button type="button" className="btn btn--ghost" onClick={commit}>
          Add
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="field-label">{label}</span>
        <span className="tiny">{hint}</span>
      </span>
    </label>
  );
}

export default function MusicForm({ initial }: { initial: MusicPrefs }) {
  const [prefs, setPrefs] = useState<MusicPrefs>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof MusicPrefs>(key: K, value: MusicPrefs[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
    setSaved(false);
  }

  function toggleGenre(g: string) {
    set(
      "genres",
      prefs.genres.includes(g) ? prefs.genres.filter((x) => x !== g) : [...prefs.genres, g]
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section>
        <article className="card">
          <div className="card-head">
            <div>
              <h3>Genres</h3>
              <p className="tiny">
                What the playlist draws from. Pick a few rather than everything — a prompt
                that names nine genres produces a playlist with no character.
              </p>
            </div>
          </div>
          <div className="chips">
            {GENRES.map((g) => (
              <button
                type="button"
                key={g}
                className={`pick${prefs.genres.includes(g) ? " pick--on" : ""}`}
                aria-pressed={prefs.genres.includes(g)}
                onClick={() => toggleGenre(g)}
              >
                {g}
              </button>
            ))}
          </div>
          {prefs.genres.length === 0 && (
            <div className="banner banner--warn">
              With nothing selected the generator falls back to whatever it thinks gym music
              is. Pick at least one.
            </div>
          )}
        </article>
      </section>

      <section>
        <article className="card">
          <div className="card-head">
            <div>
              <h3>Artists</h3>
              <p className="tiny">
                Named artists steer a playlist far harder than genres do — two or three
                favourites is usually enough.
              </p>
            </div>
          </div>
          <TagInput
            label="Favourites"
            hint="Lean toward these and things that sound like them."
            values={prefs.favouriteArtists}
            onChange={(v) => set("favouriteArtists", v)}
            placeholder="e.g. Travis Scott"
          />
          <TagInput
            label="Never play"
            hint="Excluded outright, whatever the segment asks for."
            values={prefs.avoidArtists}
            onChange={(v) => set("avoidArtists", v)}
            placeholder="e.g. an artist you're sick of"
          />
        </article>
      </section>

      <section>
        <article className="card">
          <div className="card-head">
            <div>
              <h3>How it's built</h3>
            </div>
          </div>

          <div className="field">
            <label className="field-label">Familiarity</label>
            <div className="chips">
              {FAMILIARITY.map((f) => (
                <button
                  type="button"
                  key={f.value}
                  className={`pick${prefs.familiarity === f.value ? " pick--on" : ""}`}
                  aria-pressed={prefs.familiarity === f.value}
                  onClick={() => set("familiarity", f.value)}
                  title={f.hint}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="tiny">
              {FAMILIARITY.find((f) => f.value === prefs.familiarity)?.hint}
            </p>
          </div>

          <Toggle
            label="Follow the session's energy arc"
            hint="Off holds one energy level throughout — simpler, and better if you skip around."
            checked={prefs.followArc}
            onChange={(v) => set("followArc", v)}
          />
          <Toggle
            label="Calmer on technique days"
            hint="Groove over aggression when the session is about the movement, not the load."
            checked={prefs.calmerOnTechniqueDays}
            onChange={(v) => set("calmerOnTechniqueDays", v)}
          />
          <Toggle
            label="Allow explicit lyrics"
            hint="Off asks for clean versions where they exist."
            checked={prefs.explicit}
            onChange={(v) => set("explicit", v)}
          />

          <div className="field">
            <label className="field-label">Segment lengths</label>
            <p className="tiny">
              The main-lift and accessory blocks are sized from the session itself. These two
              aren&apos;t — set them to how long you actually spend.
            </p>
            <div className="minutes">
              <label className="mins">
                <span className="tiny">Warm-up</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={prefs.warmupMinutes}
                  onChange={(e) => set("warmupMinutes", Number(e.target.value) || 0)}
                />
                <span className="tiny">min</span>
              </label>
              <label className="mins">
                <span className="tiny">Cardio</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={prefs.cardioMinutes}
                  onChange={(e) => set("cardioMinutes", Number(e.target.value) || 0)}
                />
                <span className="tiny">min</span>
              </label>
            </div>
          </div>
        </article>
      </section>

      <section>
        <article className="card">
          <div className="card-head">
            <div>
              <h3>Spotify</h3>
              <p className="tiny">
                Not connected. Today the app builds the arc and suggests tracks, and each
                track opens a Spotify search rather than claiming a specific track exists.
              </p>
            </div>
            <span className="chip">Not connected</span>
          </div>
          <p className="tiny">
            Connecting an account would let the app create the playlist in place and read
            back what you actually listened to — which is the interesting half, because it
            turns taste into evidence rather than a setting. It needs an OAuth client this
            prototype deliberately doesn&apos;t ship.
          </p>
          <div className="row">
            <button type="button" className="btn btn--ghost" disabled>
              Connect Spotify
            </button>
            <span className="tiny">Coming with OAuth</span>
          </div>
        </article>
      </section>

      <section>
        <div className="row">
          <button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : saved ? "Saved" : "Save preferences"}
          </button>
          {saved && <span className="tiny">Applied to the next playlist you build.</span>}
        </div>
        {error && <div className="banner banner--warn">{error}</div>}
      </section>
    </>
  );
}
