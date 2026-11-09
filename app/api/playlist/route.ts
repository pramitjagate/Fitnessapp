import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildArc, playlistPrompt, totalMinutes, trackCountFor } from "@/lib/playlist";
import { modelFor } from "@/lib/model";
import { getScope } from "@/lib/session";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const TrackList = z.object({
  segments: z.array(
    z.object({
      name: z.string(),
      tracks: z.array(z.object({ artist: z.string(), title: z.string() })).max(20),
    })
  ),
});

const SYSTEM = `You pick music for a strength training session. You are given an energy ARC — the session broken into segments, each with its own intensity and length in minutes — and the lifter's music preferences. Suggest tracks for each segment.

Honour the preferences: draw on the listed genres, lean toward the favourite artists, never include an avoided artist, and respect the familiarity and explicit settings. Blend genres rather than segregating them by segment.

Each segment lists a trackCount — suggest exactly that many tracks for it. That count is already sized to roughly fill the segment's stated minutes at a genre-typical track length, so use it as given rather than guessing your own; a 28-minute block that only gets 3 tracks runs out of music with half the lifting still ahead. Real tracks only — a track nobody can find is worse than a safer choice. Match the segment's described energy, not just its genre.

Return strict JSON, no prose, no markdown fences:
{"segments":[{"name":"Warm-up","tracks":[{"artist":"...","title":"..."}]}]}

Use exactly the segment names you were given, in the same order, each with exactly its requested trackCount of tracks.`;

export async function POST(request: Request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { date } = (await request.json().catch(() => ({}))) as { date?: string };
  const db = await store.read(scope.userId);
  const session = db.currentPlan.sessions.find((s) => s.date === date);

  if (!session) {
    return NextResponse.json({ error: "No session planned for that date." }, { status: 404 });
  }

  const prefs = db.music;
  const arc = buildArc(session, prefs);
  const prompt = playlistPrompt(session, arc, prefs);
  const base = {
    arc,
    prompt,
    minutes: totalMinutes(arc),
    phase: session.phase,
    focus: session.focus,
  };

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    // No key: hand back the arc and the prompt. Paste it into Spotify's own
    // generator, or read it as the spec for what to queue. Useful on its own —
    // the arc is the thinking, the tracks are just an instance of it.
    return NextResponse.json({ ...base, source: "arc-only" });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: modelFor("playlist"),
      max_tokens: 2500,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify(
            {
              session: session.focus,
              phase: session.phase,
              segments: arc.map((s) => ({ ...s, trackCount: trackCountFor(s.minutes) })),
              preferences: {
                genres: prefs.genres,
                favouriteArtists: prefs.favouriteArtists,
                avoidArtists: prefs.avoidArtists,
                familiarity: prefs.familiarity,
                allowExplicit: prefs.explicit,
              },
            },
            null,
            2
          ),
        },
      ],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();

    const parsed = TrackList.parse(JSON.parse(text));
    return NextResponse.json({ ...base, ...parsed, source: "model" });
  } catch (err) {
    // A failed playlist must never be more than a shrug. The arc still stands.
    return NextResponse.json({
      ...base,
      source: "arc-only",
      note: `Track suggestions unavailable (${(err as Error).message}). The arc below still works.`,
    });
  }
}
