import { describe, expect, it } from "vitest";
import { fillForward, suggestNextSet, topSet } from "@/lib/set-ramp";

const MAX = 500;

describe("suggestNextSet", () => {
  it("has nothing to say before the first set is entered", () => {
    expect(suggestNextSet([], 5, MAX)).toBe(0);
  });

  it("uses the unit's step for the second set, having no pattern yet", () => {
    expect(suggestNextSet([50], 5, MAX)).toBe(55);
  });

  it("follows the lifter's own increment once there is one", () => {
    expect(suggestNextSet([50, 55], 5, MAX)).toBe(60);
    // A 20lb jump is followed as a 20lb jump, not corrected to the house step.
    expect(suggestNextSet([60, 80], 5, MAX)).toBe(100);
  });

  it("stays flat on a flat pair rather than inventing a ramp", () => {
    // The important one. Repeating `step` here would push someone who does
    // straight sets onto a ramp they never chose.
    expect(suggestNextSet([60, 60], 5, MAX)).toBe(60);
  });

  it("follows a descending pattern down", () => {
    // Back-off sets are as real as warm-up ramps.
    expect(suggestNextSet([100, 90], 5, MAX)).toBe(80);
  });

  it("never proposes a negative weight", () => {
    expect(suggestNextSet([20, 10], 5, MAX)).toBe(0);
  });

  it("clamps to the maximum", () => {
    expect(suggestNextSet([480, 495], 5, MAX)).toBe(MAX);
  });

  it("ignores empty sets between entries", () => {
    expect(suggestNextSet([50, 0, 55], 5, MAX)).toBe(60);
  });
});

describe("fillForward", () => {
  it("ramps from a single entered set", () => {
    expect(fillForward([50, 0, 0], [true, false, false], 5, MAX)).toEqual([50, 55, 60]);
  });

  it("never overwrites a set the lifter touched", () => {
    // 50 entered, 55 suggested, 70 typed over it — the fourth follows the 70,
    // not the suggestion it replaced.
    expect(fillForward([50, 55, 70, 0], [true, false, true, false], 5, MAX)).toEqual([
      50, 55, 70, 85,
    ]);
  });

  it("leaves everything alone when every set is the lifter's", () => {
    const weights = [60, 60, 40];
    expect(fillForward(weights, [true, true, true], 5, MAX)).toEqual(weights);
  });

  it("proposes nothing at all until the first set exists", () => {
    expect(fillForward([0, 0, 0], [false, false, false], 5, MAX)).toEqual([0, 0, 0]);
  });
});

describe("topSet", () => {
  it("takes the heaviest, not the average", () => {
    // 40/60/80 and 60/60/60 average the same and mean completely different
    // things. The progression reads the top set.
    expect(topSet([40, 60, 80])).toBe(80);
    expect(topSet([60, 60, 60])).toBe(60);
  });

  it("survives an empty lift", () => {
    expect(topSet([])).toBe(0);
  });
});
