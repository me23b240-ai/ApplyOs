import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export const runtime = "nodejs";

// ─── Layout ─────────────────────────────────────────────
const PAGE_W = 612;
const PAGE_H = 792;
const MX = 56;
const MT = 56;
const MB = 56;
const CW = PAGE_W - MX * 2;

// ─── Fonts ──────────────────────────────────────────────
const SZ_NAME = 18;
const SZ_SECTION = 12;
const SZ_BODY = 10;
const SZ_META = 9;

// ─── Colors ─────────────────────────────────────────────
const C_TEXT = rgb(0.08, 0.08, 0.14);
const C_ACCENT = rgb(0.24, 0.22, 0.72);
const C_LINE = rgb(0.8, 0.8, 0.85);
const C_MUTED = rgb(0.45, 0.45, 0.55);

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || text.trim().length < 10) {
      return NextResponse.json(
        { error: "No resume text provided." },
        { status: 400 }
      );
    }

const pdfBytes = await buildPDF(text.trim());

const pdfBuffer = Buffer.from(pdfBytes);

return new Response(pdfBuffer, {
  status: 200,
  headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition":
      'attachment; filename="optimized_resume.pdf"',
  },
});
  } catch (err) {
    console.error("[/download] error:", err);
    return NextResponse.json(
      { error: "PDF generation failed." },
      { status: 500 }
    );
  }
}

// ─── PDF Builder ───────────────────────────────────────
async function buildPDF(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const sections = parseSections(text);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MT;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MT;
  };

  const checkSpace = (h: number) => {
    if (y - h < MB) newPage();
  };

  // ─── Safe text wrapper ───────────────────────────────
  const drawWrapped = (str: string, size = SZ_BODY, indent = 0) => {
    const words = str.split(" ");
    let line = "";
    const lines: string[] = [];

    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > CW - indent && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    for (const l of lines) {
      checkSpace(size + 4);
      page.drawText(l, {
        x: MX + indent,
        y,
        size,
        font,
        color: C_TEXT,
      });
      y -= 14;
    }
  };

  // ─── Render sections ────────────────────────────────
  for (const sec of sections) {
    if (!sec.lines.length) continue;

    // ── HEADER (Name + Contact) ──
    if (sec.header === "__HEADER__") {
      const name = sec.lines[0] || "Resume";

      checkSpace(SZ_NAME + 20);

      page.drawText(name, {
        x: MX,
        y,
        size: SZ_NAME,
        font: bold,
        color: C_TEXT,
      });

      y -= 22;

      page.drawLine({
        start: { x: MX, y },
        end: { x: MX + CW, y },
        thickness: 2,
        color: C_ACCENT,
      });

      y -= 10;

      const contact = sec.lines.slice(1).join(" · ");
      if (contact) drawWrapped(contact, SZ_META);

      y -= 10;
      continue;
    }

    // ── SECTION TITLE ──
    checkSpace(40);
    y -= 6;

    page.drawText(sec.header, {
      x: MX,
      y,
      size: SZ_SECTION,
      font: bold,
      color: C_ACCENT,
    });

    y -= 14;

    page.drawLine({
      start: { x: MX, y },
      end: { x: MX + CW, y },
      thickness: 1,
      color: C_LINE,
    });

    y -= 10;

    // ── CONTENT ──
    for (const line of sec.lines) {
      const t = line.trim();
      if (!t) continue;

      if (t.startsWith("•") || t.startsWith("-")) {
        const body = t.replace(/^[•\-]\s*/, "");

        checkSpace(14);

        page.drawText("•", {
          x: MX + 6,
          y,
          size: SZ_BODY,
          font,
          color: C_ACCENT,
        });

        drawWrapped(body, SZ_BODY, 16);
      } else {
        drawWrapped(t);
      }
    }

    y -= 8;
  }

  // ─── Page numbers ────────────────────────────────
  const pages = pdf.getPages();
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      p.drawText(`${i + 1} / ${pages.length}`, {
        x: PAGE_W / 2 - 12,
        y: 30,
        size: 8,
        font,
        color: C_MUTED,
      });
    });
  }

  return pdf.save();
}

// ─── Parser ───────────────────────────────────────────
function parseSections(text: string) {
  const lines = text.split("\n");

  const headers = [
    "EXPERIENCE",
    "EDUCATION",
    "SKILLS",
    "PROJECTS",
    "CERTIFICATIONS",
    "SUMMARY",
    "CONTACT INFORMATION",
    "PROFESSIONAL SUMMARY",
  ];

  const sections: any[] = [];
  let current: any = null;

  for (const l of lines) {
    const t = l.trim();

    const isHeader =
      headers.includes(t.toUpperCase()) ||
      (t === t.toUpperCase() && t.length > 3 && t.length < 40);

    if (isHeader) {
      if (current) sections.push(current);
      current = { header: t.toUpperCase(), lines: [] };
    } else {
      if (!current) current = { header: "__HEADER__", lines: [] };
      current.lines.push(l);
    }
  }

  if (current) sections.push(current);

  return sections;
}