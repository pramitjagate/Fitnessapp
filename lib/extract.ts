import Anthropic from "@anthropic-ai/sdk";
import { modelFor } from "./model";
import { LIFTS, NoteExtraction } from "./types";

/* ---------------------------------------------------------------------------
 * Turning a sentence into structure.
 *
 * This is the one genuinely unstructured input in the system, and the feature
 * the whole product was pitched on: read "my legs were fried and I only got 8
 * on the last set" and change next week accordingly.
 *
 * Three decisions worth defending:
 *
 * 1. It runs ONCE, when the session is logged — not on every planning pass.
 *    Cheaper, inspectable (you can look at what it pulled out and see it is
 *    wrong), and it makes notes queryable: "every time I mentioned knee pain"
 *    becomes a filter rather than a re-read.
 *
 * 2. The raw text is never replaced. The extraction is a derived view stored
 *    beside it. A log is a record; summarising on the way in throws away the
 *    only copy of what the lifter actually said.
 *
 * 3. PAIN IS THE FIELD THAT MATTERS. Fatigue and pain read almost identically
 *    in casual language — "my knee was killing me" — and they lead to opposite
 *    actions. The model finds it; code decides what happens next, and what
 *    happens is that the decision is capped at hold. No adaptive app should
 *    quietly add weight to a lift someone described as hurting.
 * ------------------------------------------------------------------------- */

const SYSTEM = `You extract structure from a strength athlete's note about a training session. You do not give advice, and you do not judge the session.

Return strict JSON, no prose, no markdown fences:
{"lift": "squat" | "deadlift" | "bench" | "overhead_press" | "row" | "other" | null,
 "signal": "fatigue" | "pain" | "technique" | "life" | "positive" | "none",
 "severity": "low" | "moderate" | "high",
 "scope": "lift" | "session",
 "mentionsPain": true | false,
 "quote": "the words that decided it, copied exactly from the note"}

FIELD BY FIELD

lift — which lift the note is about, or null if it doesn't name or clearly imply one.

signal — what kind of thing is being reported:
  fatigue    tiredness, heaviness, running out of gas, hard work
  pain       hurt, ache, twinge, pinch, sharp, tweak, "something felt wrong"
  technique  form breaking down, bar path, depth, losing position
  life       sleep, stress, work, illness, travel, time — outside the programme
  positive   felt strong, moved well, easy, flew up
  none       nothing worth acting on

severity — how strongly it is stated. "a bit tired" is low, "absolutely fried" is high.

scope — lift if it is about one movement, session if it is about the whole session.

mentionsPain — TRUE if the note describes anything that could be pain or injury, even
in passing, even hedged, even if it also mentions fatigue. When you are unsure between
pain and fatigue, set this true. A false negative here is far worse than a false
positive: the app uses it to stop adding weight, and being cautious costs a week.

quote — the exact substring of the note that drove your answer. Copy it character for
character. Do not paraphrase, and never write words the lifter did not.`;

/** Words that are pain regardless of what a model thinks. */
const PAIN_WORDS = [
  "pain", "painful", "hurt", "hurts", "hurting", "ache", "aches", "aching", "achy",
  "twinge", "tweak", "tweaked", "pinch", "pinched", "sharp", "strain", "strained",
  "pulled", "niggle", "injury", "injured", "impingement", "sore joint",
  // Idiom, because this is how people actually report it. "My knee was killing
  // me" is a pain report; no word in it is a medical term.
  "killing me", "killed me", "felt a pop", "something popped", "went in my",
  "gave out", "locked up",
];

const FATIGUE_WORDS = [
  "fried", "tired", "exhausted", "gassed", "heavy", "drained", "smoked", "dead",
  "beaten up", "had nothing", "nothing left", "no gas", "grind", "grinder",
  "brutal", "wiped", "flat",
];

const TECHNIQUE_WORDS = [
  "form", "depth", "bar path", "rounding", "position", "technique", "shaky",
  "wobbly", "ugly", "sloppy", "shifted",
];

const LIFE_WORDS = [
  "sleep", "slept", "work", "stress", "stressed", "ill", "sick", "travel",
  "travelling", "hungover", "busy", "late night",
];

const POSITIVE_WORDS = [
  "strong", "easy", "easier", "flew", "smooth", "great", "comfortable",
  "moved well", "snappy", "fast",
];

const LIFT_WORDS: [string, (typeof LIFTS)[number]][] = [
  ["squat", "squat"],
  ["deadlift", "deadlift"],
  ["bench", "bench"],
  ["overhead", "overhead_press"],
  ["ohp", "overhead_press"],
  ["press", "overhead_press"],
  ["row", "row"],
];

/**
 * The keyword extractor.
 *
 * Not a fallback in the apologetic sense — it is the baseline the model has to
 * beat, and it runs whenever there is no API key so the feature works for
 * anyone who clones this. Crude on nuance, but it will never miss the word
 * "pain", which is the part that matters.
 */
export function extractByRules(note: string): NoteExtraction {
  const text = note.toLowerCase();

  /*
   * Word boundaries, not substrings.
   *
   * The first version used `text.includes(word)`, and "still" matched "ill", so
   * a note about bench feeling heavy was filed as a life signal. Substring
   * matching in a keyword classifier is a bug that hides as vocabulary: it
   * fires on the wrong notes and looks like the words were simply badly chosen.
   */
  const has = (words: string[]) =>
    words.find((w) =>
      new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text),
    );

  const painWord = has(PAIN_WORDS);
  const fatigueWord = has(FATIGUE_WORDS);
  const techniqueWord = has(TECHNIQUE_WORDS);
  const lifeWord = has(LIFE_WORDS);
  const positiveWord = has(POSITIVE_WORDS);

  const signal: NoteExtraction["signal"] = painWord
    ? "pain"
    : fatigueWord
      ? "fatigue"
      : techniqueWord
        ? "technique"
        : lifeWord
          ? "life"
          : positiveWord
            ? "positive"
            : "none";

  const matched = painWord ?? fatigueWord ?? techniqueWord ?? lifeWord ?? positiveWord ?? "";
  const lift = LIFT_WORDS.find(([word]) => text.includes(word))?.[1] ?? null;

  // Intensifiers, not a sentiment model: "absolutely fried" and "a bit tired"
  // are the same word class carrying very different urgency.
  const high = /\b(absolutely|really|very|so|extremely|awful|terrible|brutal|worst)\b/.test(text);
  const low = /\b(bit|slightly|little|somewhat|mildly|touch)\b/.test(text);

  return {
    lift,
    signal,
    severity: high ? "high" : low ? "low" : "moderate",
    scope: lift ? "lift" : "session",
    mentionsPain: Boolean(painWord),
    quote: matched ? quoteAround(note, text.indexOf(matched), matched.length) : "",
    source: "rules",
  };
}

/** A short window of the lifter's own words around what matched. */
function quoteAround(note: string, at: number, length: number): string {
  if (at < 0) return "";
  return note.slice(Math.max(0, at - 25), Math.min(note.length, at + length + 25)).trim();
}

/** Empty note in, empty extraction out — without burning a model call on it. */
export function emptyExtraction(): NoteExtraction {
  return {
    lift: null,
    signal: "none",
    severity: "low",
    scope: "session",
    mentionsPain: false,
    quote: "",
    source: "rules",
  };
}

export async function extractNote(note: string): Promise<NoteExtraction> {
  const trimmed = note.trim();
  if (!trimmed) return emptyExtraction();

  const rules = extractByRules(trimmed);
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return rules;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: modelFor("extract"),
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: "user", content: trimmed }],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();

    const parsed = NoteExtraction.omit({ source: true }).parse(JSON.parse(text));

    return {
      ...parsed,
      // The keyword check is a floor under the model, not a tiebreak. If either
      // says pain, it is pain — a missed mention costs someone a sore knee and
      // a false one costs a week of holding the load.
      mentionsPain: parsed.mentionsPain || rules.mentionsPain,
      signal: rules.mentionsPain && parsed.signal !== "pain" ? "pain" : parsed.signal,
      source: "model",
    };
  } catch {
    // A failed extraction must never lose a session. The keyword read stands.
    return rules;
  }
}
