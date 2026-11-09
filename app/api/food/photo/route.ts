import { NextResponse } from "next/server";
import { z } from "zod";
import { estimateMeal, MealPhotoError, PHOTO_MEDIA_TYPES } from "@/lib/meal-photo";
import { getScope } from "@/lib/session";

export const runtime = "nodejs";
// Reading a plate takes 10–30s; the platform default can cut it off first.
export const maxDuration = 60;

/*
 * Estimate only — this route never writes to the log. The client shows the
 * numbers, the lifter edits them, and the entries go through /api/food like
 * anything typed by hand. The image itself is not stored anywhere.
 */

/** The API takes images up to 5MB; base64 is a third bigger than the bytes. */
const MAX_BASE64 = Math.floor((5 * 1024 * 1024 * 4) / 3);

const Body = z.object({
  image: z.string().min(1).max(MAX_BASE64, "That photo is too large. Try a smaller one."),
  mediaType: z.enum(PHOTO_MEDIA_TYPES),
  hint: z.string().max(300).default(""),
});

export async function POST(request: Request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "That photo couldn't be read." },
      { status: 400 }
    );
  }

  try {
    const estimate = await estimateMeal(parsed.data.image, parsed.data.mediaType, parsed.data.hint);
    return NextResponse.json({ estimate });
  } catch (e) {
    if (e instanceof MealPhotoError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    console.error("meal photo estimate failed", e);
    return NextResponse.json(
      { error: "Couldn't analyse the photo right now. Try again, or add it by hand." },
      { status: 502 }
    );
  }
}
