import { z } from "zod";
import { addDays, dayName, iso } from "./dates";
import { modelFor } from "./model";
import { LIFTS, type WeeklyPlan } from "./types";

/* ---------------------------------------------------------------------------
 * Getting a written programme into the app.
 *
 * Two ways in, and they meet in the same place: a DRAFT that the lifter edits
 * before anything is saved. A parsed plan is a proposal, never a commitment —
 * the file might be a blog post, the model might invent a set count, and the
 * person holding the barbell is the one who has to agree with it.
 *
 * Same split as everywhere else in this app: a keyword parser that always runs,
 * a model path that does better when a key exists, and the human deciding.
 * ------------------------------------------------------------------------- */

export const DraftExercise = z.object({
  name: z.string().min(1).max(80),
  sets: z.number().int().min(1).max(10),
  reps: z.string().min(1).max(20),
  /**
   * Set when this is one of the five lifts the adaptation loop tracks.
   *
   * Optional on input: told to omit fields it can't fill in, the model
   * sometimes omits this one too instead of writing `null` — an absent key
   * must mean the same thing as an explicit null, not fail validation.
   */
  lift: z
    .enum(LIFTS)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});
export type DraftExercise = z.infer<typeof DraftExercise>;

export const DraftDay = z.object({
  day: z.string().min(1).max(20),
  focus: z.string().min(1).max(60),
  exercises: z.array(DraftExercise),
  note: z.string().max(500).default(""),
});
export type DraftDay = z.infer<typeof DraftDay>;

export const PlanDraft = z.object({
  name: z.string().max(80).default("Imported plan"),
  goal: z.string().max(200).default(""),
  progressionRule: z.string().max(300).default(""),
  notes: z.string().max(600).default(""),
  days: z.array(DraftDay),
  source: z.enum(["model", "rules", "manual"]),
});
export type PlanDraft = z.infer<typeof PlanDraft>;

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Which of the five tracked lifts an exercise name refers to, if any. */
export function liftFor(name: string): (typeof LIFTS)[number] | null {
  const n = name.toLowerCase();
  if (/\bromanian|\brdl\b/.test(n)) return null; // an accessory, not the deadlift
  if (/\bdeadlift\b/.test(n)) return "deadlift";
  if (/\bsquat\b/.test(n)) return "squat";
  if (/\bbench\b/.test(n)) return "bench";
  if (/\brow\b/.test(n) && /barbell|bent|pendlay/.test(n)) return "row";
  if (/(shoulder|overhead|military)\s*press\b/.test(n) || /\bohp\b/.test(n)) return "overhead_press";
  return null;
}

/**
 * The focus line is captured by a lookahead that stops at the next sentence,
 * which on a real document sometimes takes a word of the following one with it
 * ("legs Before:"). Trimming it here is cosmetic — the builder shows this field
 * for editing before anything is saved — but a wrong-looking heading makes the
 * whole import look wrong.
 */
function cleanFocus(s: string): string {
  return s
    .replace(/\s+[A-Z][A-Za-z]*:?$/, "")
    .replace(/[,;:\-–—\s]+$/, "")
    .trim();
}

/**
 * The parser that always runs.
 *
 * Crude, and deliberately so: it finds day headings and "3 sets of 10 to 12"
 * shaped lines. It will miss prose and it will not understand a table. What it
 * will do is turn a plan written like most plans are written into something
 * editable in about a millisecond, with no key and no network.
 */
export function parsePlanByRules(text: string): PlanDraft {
  const flat = text.replace(/\s+/g, " ");
  const days: DraftDay[] = [];

  for (const name of DAY_NAMES) {
    /*
     * "Monday: chest and triceps" — the heading that starts a day's block.
     *
     * The focus ends at the first thing that is clearly not part of it: a
     * numbered exercise, a full stop, or the end of the text. A capitalised
     * sentence start would be a fourth stop, but this regex is
     * case-insensitive for the day name, which makes [A-Z] match "and" too and
     * truncates "chest and triceps" to "chest". cleanFocus() trims that case
     * afterwards, where the match can be tested for its real case.
     */
    const heading = new RegExp(
      `\\b${name}\\b\\s*[:\\-–—]\\s*([^.\\n]{2,300}?)(?=\\s+\\d+\\.|\\.|$)`,
      "i",
    );
    const found = flat.match(heading);
    if (!found) continue;

    const start = found.index! + found[0].length;
    // The block runs to the next day heading, or to the end.
    const rest = flat.slice(start);
    const nextIdx = DAY_NAMES.map((d) => {
      const m = rest.match(new RegExp(`\\b${d}\\b\\s*[:\\-–—]`, "i"));
      return m ? m.index! : Infinity;
    }).reduce((a, b) => Math.min(a, b), Infinity);
    const block = rest.slice(0, nextIdx === Infinity ? undefined : nextIdx);

    const exercises: DraftExercise[] = [];
    const re =
      /(\d+)\.\s*([A-Za-z][A-Za-z \-',]{2,45}?)\s*[—–-]\s*(\d+)\s*sets?\s*of\s*(\d+(?:\s*(?:to|-|–)\s*\d+)?)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) {
      const exName = m[2].trim();
      exercises.push({
        name: exName,
        sets: Number(m[3]),
        reps: m[4].replace(/\s*(?:to|–)\s*/, "-").trim(),
        lift: liftFor(exName),
      });
    }

    if (exercises.length) {
      // The heading capture window is wide (see above) so a long lead-in
      // paragraph before the first exercise doesn't stop the day matching at
      // all — but that means it can grab far more than a short focus line
      // ever should. DraftDay.focus caps at 60; slicing here keeps a save
      // from failing on a field the lifter never even sees as wrong.
      const focus = (cleanFocus(found[1]) || name).slice(0, 60);
      days.push({ day: name, focus, exercises, note: "" });
    }
  }

  return {
    name: "Imported plan",
    goal: "",
    progressionRule: "",
    notes: "",
    days,
    source: "rules",
  };
}

const SYSTEM = `You read a written training programme and return it as structured JSON. You are transcribing, not coaching: do not add exercises, do not change sets or reps, and do not improve the programme.

Return strict JSON, no prose, no markdown fences:
{"name":"...","goal":"...","progressionRule":"...","notes":"...",
 "days":[{"day":"Monday","focus":"Chest and triceps","note":"",
   "exercises":[{"name":"Flat barbell bench press","sets":3,"reps":"10","lift":"bench"}]}]}

RULES

day — the weekday name. Skip rest days entirely.
focus — the day's heading, a few words.
exercises — in the order written. reps is a string: "10", "8-10", "5,3,1".
lift — one of squat, deadlift, bench, overhead_press, row when the exercise IS that
barbell lift, otherwise null. A Romanian deadlift is NOT the deadlift; a dumbbell
shoulder press IS overhead_press; a cable row is NOT row, a barbell row is.
note — any coaching instruction attached to that day, briefly. Empty string if none.
progressionRule — how the plan says to add weight, in its own words.
notes — safety instructions and standing caveats worth keeping.

If a number is not stated, leave the field out rather than inventing one. Copying the
programme wrongly is worse than copying less of it.`;

/**
 * Truncates rather than rejects. Told to keep `notes` to standing caveats,
 * the model sometimes writes most of the document into it instead — one
 * over-length field would otherwise fail the whole parse, discarding days
 * that were read correctly along with it. Cut to fit the field's own cap
 * before validation runs.
 */
function clampFieldLengths(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const draft = raw as Record<string, unknown>;
  const clamp = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : v);

  draft.name = clamp(draft.name, 80);
  draft.goal = clamp(draft.goal, 200);
  draft.progressionRule = clamp(draft.progressionRule, 300);
  draft.notes = clamp(draft.notes, 600);

  if (Array.isArray(draft.days)) {
    for (const day of draft.days) {
      if (typeof day !== "object" || day === null) continue;
      const d = day as Record<string, unknown>;
      d.focus = clamp(d.focus, 60);
      d.note = clamp(d.note, 500);
      if (Array.isArray(d.exercises)) {
        for (const ex of d.exercises) {
          if (typeof ex !== "object" || ex === null) continue;
          const e = ex as Record<string, unknown>;
          e.name = clamp(e.name, 80);
          e.reps = clamp(e.reps, 20);
        }
      }
    }
  }

  return draft;
}

export async function parsePlanWithModel(text: string): Promise<PlanDraft> {
  const rules = parsePlanByRules(text);
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return rules;

  try {
    /*
     * Imported here, not at the top of the file. The plan builder is a client
     * component and it imports liftFor() and DAY_NAMES from this module — a
     * top-level `import Anthropic` would ship the whole SDK to the browser to
     * support a function the browser never calls. Same shape of mistake as
     * next/headers in a client bundle, one build slower to notice.
     */
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: modelFor("plan"),
      max_tokens: 4000,
      // Transcription, not reasoning — and on a thinking-capable model, unrequested
      // extended thinking can consume the whole max_tokens budget before any JSON
      // is written, which silently fails this call on every document.
      thinking: { type: "disabled" },
      system: SYSTEM,
      // Long documents get truncated rather than refused — the first few pages
      // of a training plan are the plan; the rest is usually technique notes.
      messages: [{ role: "user", content: text.slice(0, 40_000) }],
    });

    const raw = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();

    const parsed = PlanDraft.omit({ source: true }).parse(clampFieldLengths(JSON.parse(raw)));
    if (!parsed.days.length) return rules;
    return { ...parsed, source: "model" };
  } catch {
    // A failed parse falls back to the keyword pass rather than losing the
    // upload. The lifter edits either way.
    return rules;
  }
}

/**
 * Draft to plan.
 *
 * Weights are null throughout: an imported programme prescribes movements and
 * rep ranges, not loads, and inventing a number here would look exactly like a
 * real one once it is in a plan.
 */
export function draftToPlan(draft: PlanDraft, weekStart: Date): WeeklyPlan {
  const sessions = draft.days
    .slice()
    .sort((a, b) => DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day))
    .map((d) => {
      const offset = Math.max(0, DAY_NAMES.indexOf(d.day));
      const date = iso(addDays(weekStart, offset));
      const mains = d.exercises.filter((e) => e.lift);
      const accessories = d.exercises.filter((e) => !e.lift);

      return {
        day: dayName(date),
        date,
        focus: d.focus,
        phase: "volume" as const,
        mainLifts: mains.map((e) => ({
          lift: e.lift!,
          sets: e.sets,
          reps: e.reps,
          weightKg: null,
          targetRpe: 8,
          loadNote: "Imported plan — start lighter than you think you need.",
        })),
        accessories: accessories.map((e) => ({ exercise: e.name, sets: e.sets, reps: e.reps })),
        coachingNote: d.note,
      };
    });

  return {
    weekStart: iso(weekStart),
    weekEnd: iso(addDays(weekStart, 6)),
    blockWeek: 1,
    summary: draft.name || "Imported plan",
    sessions,
    adjustments: [],
    rationale:
      "Imported from a written plan rather than generated, so nothing has been adapted yet. The loop starts from next week.",
  };
}
