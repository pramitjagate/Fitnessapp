/* ---------------------------------------------------------------------------
 * Which model runs which job.
 *
 * Four places in this app call Claude, and they are not the same difficulty:
 *
 *   extract  — read one sentence, return a small JSON object. A classification
 *              task. The cheapest capable model is the right one.
 *   plan     — read eight pages of PDF without inventing a set count.
 *   adapt    — reason over a month of logged sessions.
 *   playlist — pick tracks against a session's energy arc.
 *
 * A single ANTHROPIC_MODEL for all four means either paying a large model's
 * price to classify one sentence, or putting the plan importer on a small one
 * to save money on extraction. So each task can be pointed somewhere else, and
 * falls back to the shared setting when it isn't.
 *
 * This is also the switch the fine-tuning experiment runs on. The question in
 * that phase is whether a small model tuned on this lifter's own notes matches
 * a large general one at extraction specifically — which is unanswerable if
 * extraction can't be pointed at a different model than everything else.
 * ------------------------------------------------------------------------- */

export type ModelTask = "extract" | "plan" | "adapt" | "playlist";

/** Used when nothing is configured at all. */
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const ENV_KEY: Record<ModelTask, string> = {
  extract: "ANTHROPIC_MODEL_EXTRACT",
  plan: "ANTHROPIC_MODEL_PLAN",
  adapt: "ANTHROPIC_MODEL_ADAPT",
  playlist: "ANTHROPIC_MODEL_PLAYLIST",
};

/**
 * Most specific wins: the task's own variable, then the shared one, then the
 * built-in default. Whitespace-only values are treated as unset — an empty
 * line in a .env file is a mistake, not a request for a model named "".
 */
export function modelFor(task: ModelTask): string {
  const specific = process.env[ENV_KEY[task]]?.trim();
  if (specific) return specific;

  const shared = process.env.ANTHROPIC_MODEL?.trim();
  if (shared) return shared;

  return DEFAULT_MODEL;
}
