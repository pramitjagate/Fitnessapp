"use client";

import Link from "next/link";
import { useState } from "react";
import { spotifySearchUrl, type Segment } from "@/lib/playlist";

interface Track {
  artist: string;
  title: string;
}

interface Result {
  arc: Segment[];
  prompt: string;
  minutes: number;
  source: "model" | "arc-only";
  note?: string;
  segments?: { name: string; tracks: Track[] }[];
}

interface ExportResult {
  url: string;
  matched: number;
  total: number;
  missing: Track[];
}

export default function PlaylistButton({
  date,
  focus,
  spotifyConnected,
}: {
  date: string;
  focus: string;
  spotifyConnected: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<ExportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    setExported(null);
    setExportError(null);
    try {
      const res = await fetch("/api/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not build a playlist");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function exportToSpotify() {
    if (!result?.segments) return;
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/playlist/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, focus, segments: result.segments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not export to Spotify");
      setExported(data);
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const tracksFor = (name: string) =>
    result?.segments?.find((s) => s.name === name)?.tracks ?? [];

  return (
    <section>
      <div className="card">
        <div className="card-head">
          <div>
            <h3>Session playlist</h3>
            <p className="tiny">
              Built around the shape of the session, not a genre — building through the warm-up,
              peaking on the main lifts, flat and steady for cardio.
            </p>
          </div>
        </div>

        <div className="row">
          <button type="button" onClick={generate} disabled={busy}>
            {busy ? "Building…" : result ? "Rebuild playlist" : "Build today's playlist"}
          </button>
          <Link href="/music" className="btn btn--ghost">
            Music preferences
          </Link>
        </div>

        {error && <div className="banner banner--warn">{error}</div>}
        {result?.note && <div className="banner banner--warn">{result.note}</div>}

        {result && (
          <>
            <p className="tiny">
              {result.minutes} minutes across {result.arc.length} segments
              {result.source === "arc-only" &&
                " · no API key, so this is the arc rather than named tracks"}
            </p>

            <div className="arc">
              {result.arc.map((seg) => {
                const tracks = tracksFor(seg.name);
                return (
                  <div className="arc-seg" key={seg.name}>
                    <div className="arc-head">
                      <span className="arc-name">{seg.name}</span>
                      <span className="arc-min">{seg.minutes} min</span>
                    </div>
                    <p className="arc-brief">{seg.brief}</p>
                    {tracks.length > 0 && (
                      <ul className="tracks">
                        {tracks.map((t) => (
                          <li key={`${t.artist}-${t.title}`}>
                            <a
                              href={spotifySearchUrl(`${t.artist} ${t.title}`)}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              <span className="track-title">{t.title}</span>
                              <span className="track-artist">{t.artist}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            {result.source === "model" && (
              <p className="tiny">
                Suggestions, not a verified tracklist — each one opens a Spotify search rather
                than claiming a specific track exists. If a search comes back empty, that&apos;s
                the model being wrong, visibly.
              </p>
            )}

            {result.source === "model" && spotifyConnected && (
              <div className="row">
                <button type="button" onClick={exportToSpotify} disabled={exporting}>
                  {exporting ? "Exporting…" : "Export to Spotify"}
                </button>
              </div>
            )}

            {exportError && <div className="banner banner--warn">{exportError}</div>}

            {exported && (
              <div className="banner">
                <p>
                  Created in your Spotify account —{" "}
                  <a href={exported.url} target="_blank" rel="noreferrer noopener">
                    open it
                  </a>
                  . Matched {exported.matched} of {exported.total} suggested tracks.
                </p>
                {exported.missing.length > 0 && (
                  <p className="tiny">
                    Not found on Spotify: {exported.missing.map((t) => `${t.title} — ${t.artist}`).join(", ")}
                  </p>
                )}
              </div>
            )}

            {result.source === "arc-only" && (
              <details className="prompt-details">
                <summary>The prompt</summary>
                <p className="prompt-text">{result.prompt}</p>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  );
}
