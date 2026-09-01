/* ---------------------------------------------------------------------------
 * Ramping sets.
 *
 * Almost nobody does three sets at one weight. They go 50, 55, 60 — or on a
 * heavy day 60, 60, 50 when the third one falls apart. Making the lifter type
 * each of those into a stepper is the kind of friction that ends with them not
 * logging at all, which costs the adaptation loop far more than a wrong number
 * would.
 *
 * So the app proposes the next set from the pattern already on screen. Two
 * rules keep that honest:
 *
 *   1. It follows the lifter's own increment, never a house one. If they went
 *      50 → 55, the next guess is 60. If they went 50 → 50, the next guess is
 *      50 — repeating the step there would invent a ramp they did not do.
 *   2. A suggestion is only ever a prefilled field. It is shown as suggested,
 *      it sits next to a stepper, and one tap changes it.
 * ------------------------------------------------------------------------- */

/**
 * The weight to propose for the next set, given the ones before it.
 *
 * Descending is followed too: 100 → 90 proposes 80, because back-off sets are
 * as real a pattern as warm-up ramps and the app has no business assuming
 * every session goes up.
 */
export function suggestNextSet(previous: number[], step: number, max: number): number {
  const known = previous.filter((v) => v > 0);
  if (known.length === 0) return 0;

  const last = known[known.length - 1];
  if (known.length === 1) return Math.min(max, last + step);

  const delta = last - known[known.length - 2];
  if (delta === 0) return last;
  return Math.min(max, Math.max(0, last + delta));
}

/**
 * Fill in every set the lifter has not touched, left to right, each one
 * following the pattern of the sets before it. Touched sets are never
 * overwritten — the moment someone types a number it stops being a guess.
 */
export function fillForward(
  weights: number[],
  touched: boolean[],
  step: number,
  max: number
): number[] {
  const out = weights.slice();
  for (let i = 0; i < out.length; i++) {
    if (touched[i]) continue;
    out[i] = i === 0 ? out[0] : suggestNextSet(out.slice(0, i), step, max);
  }
  return out;
}

/**
 * What goes in `weightKg` when a lift was ramped: the heaviest set.
 *
 * Averaging would be worse than useless. A session of 40/60/80 and one of
 * 60/60/60 average the same, and only one of them told you anything about what
 * the lifter can do. The top set is what the progression reads.
 */
export function topSet(weights: number[]): number {
  return weights.reduce((a, b) => Math.max(a, b), 0);
}
