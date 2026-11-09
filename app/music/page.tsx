import MusicForm from "./music-form";
import { requireScope } from "@/lib/session";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

const SPOTIFY_BANNER = {
  connected: "Spotify connected.",
  denied: "Spotify connection cancelled. Nothing was changed.",
  error: "Could not connect Spotify. Try again.",
} as const;

export default async function MusicPage({
  searchParams,
}: {
  searchParams: Promise<{ spotify?: string }>;
}) {
  const { userId } = await requireScope();
  const [prefs, connection] = await Promise.all([
    store.readMusicPrefs(userId),
    store.readSpotifyConnection(userId),
  ]);
  const { spotify } = await searchParams;
  const banner = SPOTIFY_BANNER[spotify as keyof typeof SPOTIFY_BANNER];

  return (
    <>
      <section>
        <div>
          <div className="eyebrow">Sound</div>
          <h1>Music</h1>
        </div>
        <p className="muted">
          These preferences shape every playlist the app builds. The energy arc — building
          through the warm-up, peaking on the main lifts, flat for cardio — is fixed by the
          session; this page decides what that arc is made of.
        </p>
      </section>

      {banner && (
        <section>
          <div className={`banner${spotify === "error" ? " banner--warn" : ""}`}>{banner}</div>
        </section>
      )}

      <MusicForm
        initial={prefs}
        spotifyConnected={connection !== null}
        spotifyDisplayName={connection?.displayName ?? null}
      />
    </>
  );
}
