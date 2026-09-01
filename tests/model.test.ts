import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { modelFor } from "@/lib/model";

const KEYS = [
  "ANTHROPIC_MODEL",
  "ANTHROPIC_MODEL_EXTRACT",
  "ANTHROPIC_MODEL_PLAN",
  "ANTHROPIC_MODEL_ADAPT",
  "ANTHROPIC_MODEL_PLAYLIST",
];

describe("modelFor", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("falls back to the built-in default when nothing is configured", () => {
    expect(modelFor("extract")).toBe("claude-haiku-4-5-20251001");
  });

  it("uses the shared variable for every task", () => {
    process.env.ANTHROPIC_MODEL = "shared-model";
    for (const task of ["extract", "plan", "adapt", "playlist"] as const) {
      expect(modelFor(task)).toBe("shared-model");
    }
  });

  it("lets one task override the shared variable without affecting the others", () => {
    // The whole reason this module exists: reading one sentence and reading
    // eight pages of PDF are different jobs, and the fine-tune experiment needs
    // to point extraction somewhere else than everything else.
    process.env.ANTHROPIC_MODEL = "shared-model";
    process.env.ANTHROPIC_MODEL_EXTRACT = "tuned-model";
    expect(modelFor("extract")).toBe("tuned-model");
    expect(modelFor("plan")).toBe("shared-model");
    expect(modelFor("adapt")).toBe("shared-model");
  });

  it("treats a blank value as unset rather than as a model named nothing", () => {
    // An empty line in a .env file is a mistake. Passing "" to the API would
    // fail at request time with a message about the model, a long way from the
    // env file that caused it.
    process.env.ANTHROPIC_MODEL = "   ";
    process.env.ANTHROPIC_MODEL_EXTRACT = "";
    expect(modelFor("extract")).toBe("claude-haiku-4-5-20251001");
  });

  it("trims whitespace around a real value", () => {
    process.env.ANTHROPIC_MODEL_PLAN = "  claude-sonnet-5  ";
    expect(modelFor("plan")).toBe("claude-sonnet-5");
  });
});
