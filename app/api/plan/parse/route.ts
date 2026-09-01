import { NextResponse } from "next/server";
import { parsePlanWithModel } from "@/lib/plan-import";
import { getScope } from "@/lib/session";

/**
 * Upload → draft. This route reads a file and returns a proposal; it saves
 * nothing. Everything it produces goes back to the builder for the lifter to
 * check, because a document parser confidently returning "4 sets of 12" from a
 * blog post's sidebar is indistinguishable from one that read the plan.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;

async function textFrom(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf")) {
    // Imported lazily: both parsers are heavy, and a manual-entry user should
    // never pay to load them.
    const { extractText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(doc, { mergePages: true });
    return text;
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }

  if (name.endsWith(".txt") || name.endsWith(".md")) return buf.toString("utf8");

  // .doc is the old binary format — mammoth does not read it, and pretending
  // otherwise produces mojibake that looks like a bad parse.
  throw new Error("Upload a PDF, DOCX, TXT or MD file. Old .doc files aren't readable here.");
}

export async function POST(request: Request) {
  const scope = await getScope();
  if (!scope) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: "No file was attached." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is over 5MB." }, { status: 413 });
  }

  let text: string;
  try {
    text = await textFrom(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read that file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (text.trim().length < 40) {
    return NextResponse.json(
      {
        error:
          "Almost no text came out of that file — it's probably a scan or a photo. Type the plan in instead.",
      },
      { status: 422 }
    );
  }

  const draft = await parsePlanWithModel(text);
  if (!draft.days.length) {
    return NextResponse.json(
      {
        error:
          "The file was readable but no training days were found in it. Build the plan manually — the tab next door starts empty.",
      },
      { status: 422 }
    );
  }

  return NextResponse.json({ draft });
}
