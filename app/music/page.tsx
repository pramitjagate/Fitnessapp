import MusicForm from "./music-form";
import { requireScope } from "@/lib/session";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function MusicPage() {
  const { userId } = await requireScope();
  const prefs = await store.readMusicPrefs(userId);

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

      <MusicForm initial={prefs} />
    </>
  );
}
