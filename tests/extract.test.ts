import { describe, expect, it } from "vitest";
import { decideByRules } from "@/lib/adapt";
import { emptyExtraction, extractByRules } from "@/lib/extract";
import { evidence, session } from "./helpers";

/**
 * The keyword extractor is the baseline the model has to beat, and the one that
 * runs for anyone without an API key. It is crude on nuance by design — but it
 * must never miss the word "pain", because that is the field with consequences.
 */
describe("extractByRules", () => {
  it("reads the product's headline example", () => {
    const e = extractByRules("my legs were fried and I only got 8 on the last set");
    expect(e.signal).toBe("fatigue");
    expect(e.mentionsPain).toBe(false);
  });

  it("catches pain stated plainly", () => {
    const e = extractByRules("Sharp twinge in my left knee on the second set of squats");
    expect(e.signal).toBe("pain");
    expect(e.mentionsPain).toBe(true);
    expect(e.lift).toBe("squat");
  });

  it("catches pain stated as idiom, which is how people actually say it", () => {
    for (const note of [
      "knee was killing me on the way up",
      "felt a pop in my hamstring",
      "back locked up on the third rep",
    ]) {
      expect(extractByRules(note).mentionsPain).toBe(true);
    }
  });

  it("does not mistake hard work for pain", () => {
    // The distinction the whole product rests on.
    for (const note of [
      "absolutely brutal, thought I'd have to drop the last set",
      "legs had nothing left",
      "felt heavy today",
    ]) {
      expect(extractByRules(note).mentionsPain).toBe(false);
    }
  });

  it("matches whole words, not substrings", () => {
    // "still" contains "ill". The first version of this filed a note about
    // bench feeling heavy as a life signal because of it.
    const e = extractByRules("Bench is still costing more than it should at this weight");
    expect(e.signal).not.toBe("life");
  });

  it("reads intensifiers as severity", () => {
    expect(extractByRules("absolutely fried").severity).toBe("high");
    expect(extractByRules("a bit tired").severity).toBe("low");
  });

  it("quotes the lifter rather than paraphrasing", () => {
    const note = "Sharp twinge in my left knee on the second set";
    expect(note.toLowerCase()).toContain(extractByRules(note).quote.toLowerCase());
  });

  it("returns an empty reading for an empty note rather than guessing", () => {
    expect(extractByRules("").signal).toBe("none");
    expect(emptyExtraction().mentionsPain).toBe(false);
  });

  /*
   * Known gaps, kept as documentation rather than hidden.
   *
   * These are the cases the keyword pass gets wrong, and they are the argument
   * for the model path — and, later, for measuring a fine-tune against exactly
   * this baseline. When that comparison exists, these are its first rows.
   */
  it.fails("understands negated pain (a known gap in the keyword pass)", () => {
    expect(extractByRules("no pain today, just tired").mentionsPain).toBe(false);
  });
});

describe("pain caps the decision at hold", () => {
  const painful = () => session({ extraction: extractByRules("sharp twinge in my knee") });

  it("holds even when every rep was completed at target RPE", () => {
    // Without the guard this progresses: the work was done, the RPE was fine.
    // Nothing goes up on a lift that hurts.
    const [d] = decideByRules([evidence({ history: [painful()] })], 2);
    expect(d.decision).toBe("hold");
    expect(d.reason).toMatch(/pain/i);
  });

  it("outranks a two-week volume cut", () => {
    const [d] = decideByRules(
      [
        evidence({
          history: [
            session({
              hitAllReps: false,
              extraction: extractByRules("knee was killing me"),
            }),
            session({ hitAllReps: false }),
          ],
        }),
      ],
      2,
    );
    expect(d.decision).toBe("hold");
    expect(d.reason).toMatch(/pain/i);
  });

  it("quotes the lifter's words back in the reason", () => {
    const [d] = decideByRules([evidence({ history: [painful()] })], 2);
    expect(d.reason).toMatch(/twinge/i);
  });

  it("leaves a fatigue note alone", () => {
    const [d] = decideByRules(
      [evidence({ history: [session({ extraction: extractByRules("legs were fried") })] })],
      2,
    );
    expect(d.decision).toBe("progress");
  });
});
