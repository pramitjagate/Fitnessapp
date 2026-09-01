import type { Profile } from "./types";

/* ---------------------------------------------------------------------------
 * Loads are STORED in kilograms, always, and converted only for display.
 *
 * The alternative — storing whatever unit the lifter picked — is how a training
 * log ends up with 102.05kg on the bar: someone switches units once, and every
 * historical number silently means something different. One canonical unit in
 * the database, conversion at the edge.
 *
 * The catch this fixes: the `units` field existed on the profile and nothing
 * read it, so a lifter training in pounds saw every number in kilos. Accurate,
 * and useless to them.
 * ------------------------------------------------------------------------- */

const LB_PER_KG = 2.2046226218;

export type Units = Profile["units"];

export function kgToDisplay(kg: number, units: Units): number {
  if (units === "lb") return Math.round(kg * LB_PER_KG);
  // Kilos land on 0.25 because the smallest common plate pair is 1.25kg.
  return Math.round(kg * 4) / 4;
}

export function displayToKg(value: number, units: Units): number {
  if (units === "lb") return Math.round((value / LB_PER_KG) * 100) / 100;
  return value;
}

export function formatWeight(kg: number, units: Units): string {
  return `${kgToDisplay(kg, units)}${units}`;
}

/**
 * What one press of the stepper should move.
 *
 * 5lb in a US gym, 1.25kg elsewhere — the smallest pair of plates on the rack.
 * A stepper that moves in the wrong increment is worse than a text field.
 */
export function weightStep(units: Units): number {
  return units === "lb" ? 5 : 1.25;
}
