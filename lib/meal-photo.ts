import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { modelFor } from "./model";

/* ---------------------------------------------------------------------------
 * A photo of a plate, turned into numbers.
 *
 * Three decisions worth defending:
 *
 * 1. It is an ESTIMATE, and the UI treats it as one. Nothing is logged until
 *    the lifter has seen every number and had the chance to change it. A model
 *    guessing 40g of protein for a chicken breast it can't weigh is a starting
 *    point, not a record.
 *
 * 2. The photo is never stored. It goes to the model, the numbers come back,
 *    and the image is dropped. A food log needs what was eaten, not a gallery.
 *
 * 3. Structured output, not "return JSON please". The schema is enforced by the
 *    API, then checked again with zod and clamped to the same bounds FoodEntry
 *    accepts, so a misread can't produce a 9,000 kcal entry the log rejects.
 * ------------------------------------------------------------------------- */

const SYSTEM = `You estimate the nutrition of a meal from a photo, for a strength athlete's food log.

Identify each distinct food on the plate (or in the bowl, packet, glass) and estimate its portion from visual cues: plate and cutlery size, hand size, packaging, typical servings. Then estimate calories, protein, carbohydrate and fat for that portion.

Rules:
- One item per distinct food. "Grilled chicken breast", "white rice", "broccoli" — not one combined item, unless it is a single mixed dish (a curry, a burrito, a smoothie).
- Labels are short and plain, under 60 characters, and include your portion estimate: "Grilled chicken breast (~150g)".
- Cooking fat and sauces count. If something looks fried or glossy with oil, include it.
- If the lifter's note gives a weight, brand or ingredient, it overrides what you see.
- Use whole numbers. Never give a range.
- confidence is "low" when portions are hidden, the photo is unclear, or the dish could vary a lot; "high" only for packaged food with a visible label or very standard portions.
- notes is one short sentence on the biggest uncertainty, e.g. "Oil in the stir-fry is hard to judge." Empty string if none.
- If the photo does not show food or drink, set isFood to false and return no items.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isFood", "items", "confidence", "notes"],
  properties: {
    isFood: { type: "boolean" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "kcal", "protein", "carbs", "fat"],
        properties: {
          label: { type: "string" },
          kcal: { type: "integer" },
          protein: { type: "integer" },
          carbs: { type: "integer" },
          fat: { type: "integer" },
        },
      },
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    notes: { type: "string" },
  },
} as const;

/** Same bounds as FoodEntry, so anything returned here can be logged as-is. */
const clamp = (max: number) =>
  z.number().transform((n) => Math.min(max, Math.max(0, Math.round(n))));

export const MealItem = z.object({
  label: z.string().transform((s) => s.trim().slice(0, 80) || "Unnamed item"),
  kcal: clamp(5000),
  protein: clamp(400),
  carbs: clamp(800),
  fat: clamp(400),
});
export type MealItem = z.infer<typeof MealItem>;

export const MealEstimate = z.object({
  isFood: z.boolean(),
  items: z.array(MealItem).max(20),
  confidence: z.enum(["low", "medium", "high"]),
  notes: z.string(),
});
export type MealEstimate = z.infer<typeof MealEstimate>;

export const PHOTO_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type PhotoMediaType = (typeof PHOTO_MEDIA_TYPES)[number];

export class MealPhotoError extends Error {}

/** The model the defaults below were written for. */
const DEFAULT_MEAL_MODEL = "claude-opus-5-5";

export async function estimateMeal(
  imageBase64: string,
  mediaType: PhotoMediaType,
  hint: string
): Promise<MealEstimate> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new MealPhotoError("Photo logging needs ANTHROPIC_API_KEY set on the server.");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = modelFor("meal");
  // Effort and server-side refusal fallback are only valid on current models.
  // If ANTHROPIC_MODEL_MEAL points somewhere older, send the plain request.
  const current = model === DEFAULT_MEAL_MODEL;

  const message = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    ...(current
      ? {
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default" as const,
        }
      : {}),
    output_config: {
      ...(current ? { effort: "medium" as const } : {}),
      format: { type: "json_schema", schema: SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          {
            type: "text",
            text: hint.trim()
              ? `Note from the lifter: ${hint.trim()}`
              : "No note from the lifter.",
          },
        ],
      },
    ],
  });

  if (message.stop_reason === "refusal") {
    throw new MealPhotoError("That photo couldn't be analysed. Try another, or add it by hand.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new MealPhotoError("The estimate was cut off. Try a photo with fewer items.");
  }

  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    return MealEstimate.parse(JSON.parse(text));
  } catch {
    throw new MealPhotoError("The estimate came back unreadable. Try again.");
  }
}
