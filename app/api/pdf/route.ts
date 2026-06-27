import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  console.log("[pdf/route] Request received");

  // ── 1. Parse multipart form ──────────────────────────────────────────────
  let file: File | null = null;
  try {
    const form = await req.formData();
    file = form.get("file") as File | null;
    console.log("[pdf/route] FormData parsed, file:", file?.name ?? "null");
  } catch (err) {
    console.error("[pdf/route] FormData parse error:", err);
    return NextResponse.json(
      { error: "Failed to parse form data", detail: String(err) },
      { status: 400 }
    );
  }

  if (!file) {
    console.warn("[pdf/route] No file field in form");
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
    console.warn("[pdf/route] Wrong file type:", file.type);
    return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
  }

  // ── 2. Read file bytes ───────────────────────────────────────────────────
  let fileBytes: Uint8Array;
  try {
    const arrayBuffer = await file.arrayBuffer();
    fileBytes = new Uint8Array(arrayBuffer);
    console.log("[pdf/route] File bytes read, size:", fileBytes.byteLength);
  } catch (err) {
    console.error("[pdf/route] Failed to read file bytes:", err);
    return NextResponse.json(
      { error: "Failed to read file", detail: String(err) },
      { status: 500 }
    );
  }

  // ── 3. Validate PDF magic bytes ──────────────────────────────────────────
  const magic = String.fromCharCode(...fileBytes.slice(0, 5));
  if (!magic.startsWith("%PDF")) {
    console.warn("[pdf/route] Invalid PDF magic bytes:", magic);
    return NextResponse.json(
      { error: "Uploaded file is not a valid PDF" },
      { status: 400 }
    );
  }
  console.log("[pdf/route] PDF magic bytes OK:", magic);

  // ── 4. Extract text with unpdf ───────────────────────────────────────────
  let extractedText = "";
  let pageCount = 0;

  try {
    console.log("[pdf/route] Loading document with unpdf...");

    const pdf = await getDocumentProxy(fileBytes);
    pageCount = pdf.numPages;
    console.log("[pdf/route] Page count:", pageCount);

    const { text } = await extractText(pdf, { mergePages: true });
    extractedText = (Array.isArray(text) ? text.join("\n\n") : text).trim();

    console.log("[pdf/route] Extraction complete, chars:", extractedText.length);
  } catch (err) {
    console.error("[pdf/route] unpdf extraction error:", err);
    return NextResponse.json(
      {
        error: "PDF text extraction failed",
        detail: String(err),
      },
      { status: 500 }
    );
  }

  // ── 5. Return result ─────────────────────────────────────────────────────
  console.log("[pdf/route] Returning success response");
  return NextResponse.json({
    text: extractedText,
    pages: pageCount,
    chars: extractedText.length,
  });
}