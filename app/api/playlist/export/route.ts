import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addTracksToPlaylist,
  createPlaylist,
  getValidAccessToken,
  searchTrack,
} from "@/lib/spotify";
import { getScope } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  date: z.string(),
  focus: z.string(),
  segments: z.array(
    z.object({
      name: z.string(),
      tracks: z.array(z.object({ artist: z.string(), title: z.string() })),
    })
  ),
});

/**
 * Turns the suggestions already on the page into a real playlist. Takes the
 * segments the client already has rather than regenerating them — a second
 * model call here could suggest different tracks than the ones the lifter
 * is looking at, which would make "export" lie about what it exported.
 */
export async function POST(request: Request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Could not read that playlist." }, { status: 400 });
  }
  const { date, focus, segments } = parsed.data;

  const accessToken = await getValidAccessToken(scope.userId);
  if (!accessToken) {
    return NextResponse.json({ error: "Spotify isn't connected. Connect it on /music." }, { status: 400 });
  }

  const wanted = segments.flatMap((s) => s.tracks);
  if (!wanted.length) {
    return NextResponse.json({ error: "No suggested tracks to export." }, { status: 400 });
  }

  const found: { uri: string; name: string; artist: string }[] = [];
  const missing: { artist: string; title: string }[] = [];

  try {
    for (const t of wanted) {
      const match = await searchTrack(accessToken, t.artist, t.title);
      if (match) found.push(match);
      else missing.push(t);
    }

    if (!found.length) {
      return NextResponse.json(
        { error: "None of the suggested tracks could be found on Spotify." },
        { status: 422 }
      );
    }

    const playlist = await createPlaylist(
      accessToken,
      `Kaizen — ${focus} — ${date}`,
      "Built by Kaizen from this session's energy arc."
    );
    await addTracksToPlaylist(
      accessToken,
      playlist.id,
      found.map((f) => f.uri)
    );

    return NextResponse.json({
      url: playlist.url,
      matched: found.length,
      total: wanted.length,
      missing,
    });
  } catch (err) {
    // Spotify's own error bodies are the only clue a 403/429/5xx leaves —
    // surfacing the message is more useful here than a generic failure,
    // since the fix (reconnect, wait, add the account under User
    // Management) differs by what Spotify actually said.
    return NextResponse.json(
      { error: `Spotify export failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
