import { DEFAULT_MUSIC_PREFS, type MusicPrefs, type PlannedSession } from "./types";

/* ---------------------------------------------------------------------------
 * A session is not one energy level, and that is the whole idea here.
 *
 * A playlist that peaks during the warm-up and goes quiet under the heaviest
 * set fights the session instead of carrying it. So the generator describes an
 * ARC — four segments, each with its own tempo and intensity — rather than
 * asking for "workout music".
 * ------------------------------------------------------------------------- */

export interface PhaseProfile {
  label: string;
  peak: string;
  bpm: string;
}

const PHASE_PROFILES: Record<string, PhaseProfile> = {
  heavy_singles: {
    label: "peak aggression",
    peak: "hard 808s and heavy drops; slow-building intros suit the walk-up to the bar",
    bpm: "140–150 BPM trap, or 70–75 half-time",
  },
  volume: {
    label: "relentless drive",
    peak: "steady momentum rather than big peaks — house and drum-heavy trap",
    bpm: "125–140 BPM",
  },
  technique: {
    label: "groove over aggression",
    peak: "melodic house and smoother hip-hop; enough energy to move, not enough to rush the tempo",
    bpm: "115–128 BPM",
  },
  deload: {
    label: "deliberately lower",
    peak: "melodic and future bass, mid-tempo hip-hop — a light day shouldn't feel like a wasted one",
    bpm: "100–120 BPM",
  },
  rest: { label: "rest", peak: "no training playlist", bpm: "—" },
};

export interface Segment {
  name: string;
  minutes: number;
  brief: string;
}

/**
 * Four segments, in the order the session actually happens.
 *
 * Preferences change the segment *lengths* and, with the arc switched off, the
 * shape — but never the order. The order is the session.
 */
export function buildArc(session: PlannedSession, prefs: MusicPrefs = DEFAULT_MUSIC_PREFS): Segment[] {
  const technique = session.phase === "technique" && prefs.calmerOnTechniqueDays;
  const profile = technique
    ? PHASE_PROFILES.technique
    : PHASE_PROFILES[session.phase] ?? PHASE_PROFILES.volume;
  // Roughly seven minutes per accessory movement, floored so a bare session
  // still gets a real block rather than a token one.
  const accessoryMinutes = Math.max(12, session.accessories.length * 7);

  const flat =
    "Held at one steady energy level — no build, no drop, so it doesn't matter where in the session you are.";

  const segments: Segment[] = [
    {
      name: "Warm-up",
      minutes: prefs.warmupMinutes,
      brief: prefs.followArc
        ? "Mid-tempo and building. Opening on the hardest track of the day peaks before the body is ready and leaves nowhere to climb."
        : flat,
    },
    {
      name: `Main lifts — ${session.mainLifts.map((l) => l.lift.replace(/_/g, " ")).join(" and ")}`,
      minutes: 28,
      brief: prefs.followArc ? `The peak: ${profile.label}. ${profile.peak}. ${profile.bpm}.` : flat,
    },
    {
      name: "Accessories",
      minutes: accessoryMinutes,
      brief: prefs.followArc
        ? "Sustained but a step below peak. Higher reps with short rests want continuous momentum rather than drops."
        : flat,
    },
    {
      name: "Cardio",
      minutes: prefs.cardioMinutes,
      brief: prefs.followArc
        ? "Steady four-on-the-floor house at a constant tempo. Treadmill work comes after lifting, so the playlist must not fade out when the barbell does — and a constant BPM genuinely helps hold a pace."
        : flat,
    },
  ];

  // A zero-minute segment is a preference, not an oversight — someone who
  // doesn't do cardio shouldn't be given music for it.
  return segments.filter((s) => s.minutes > 0);
}

export function totalMinutes(arc: Segment[]): number {
  return arc.reduce((a, s) => a + s.minutes, 0);
}

/**
 * The prompt a generator (Spotify's own, or a model) should be given. Naming
 * the arc explicitly outperforms a genre list by a wide margin — describe the
 * session, not the music.
 */
export function playlistPrompt(
  session: PlannedSession,
  arc: Segment[],
  prefs: MusicPrefs = DEFAULT_MUSIC_PREFS
): string {
  const parts = arc.map((s) => `${s.minutes} minutes for ${s.name.toLowerCase()}: ${s.brief}`);
  const genres = prefs.genres.length ? prefs.genres.join(", ").toLowerCase() : "gym-friendly music";

  const extras: string[] = [];
  if (prefs.favouriteArtists.length)
    extras.push(`Lean toward ${prefs.favouriteArtists.join(", ")} and artists close to them.`);
  if (prefs.avoidArtists.length)
    extras.push(`Never include ${prefs.avoidArtists.join(", ")}.`);
  extras.push(
    {
      known: "Stick to well-known tracks the listener has probably heard before.",
      mixed: "Mostly recognisable tracks, with a few less obvious ones.",
      discovery: "Favour tracks the listener is unlikely to have heard — deeper cuts over hits.",
    }[prefs.familiarity]
  );
  if (!prefs.explicit) extras.push("Clean versions only — no explicit lyrics.");

  return `Create a ${totalMinutes(arc)} minute gym playlist for this session — ${session.focus.toLowerCase()} — drawing on ${genres}. ${parts.join(" Then ")} ${extras.join(" ")}`.trim();
}

/** Spotify search deep link. */
export function spotifySearchUrl(query: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}
