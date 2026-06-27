import { NextRequest, NextResponse } from "next/server";
import { analyzeResume, getMatchedKeywords, getMissingKeywords, extractKeywords } from "@/lib/resumeEngine";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { resume, jobDesc } = body as { resume?: string; jobDesc?: string };

    if (!resume || resume.trim().length < 30) {
      return NextResponse.json({ error: "Resume text is missing or too short." }, { status: 400 });
    }
    if (!jobDesc || jobDesc.trim().length < 20) {
      return NextResponse.json({ error: "Job description is missing or too short." }, { status: 400 });
    }

    const raw = await analyzeResume(resume.trim(), jobDesc.trim());

    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      console.error("[/api/ai] JSON parse failed, raw:", raw);
      return NextResponse.json({ error: "AI returned invalid response. Please try again." }, { status: 500 });
    }

    const matchedKeywords = getMatchedKeywords(resume, jobDesc);
    const allKeywords = extractKeywords(jobDesc);
    const matchScore = allKeywords.length > 0
      ? Math.round((matchedKeywords.length / Math.min(allKeywords.length, 20)) * 100)
      : 0;

    return NextResponse.json({ result, matchScore });
  } catch (err) {
    console.error("[/api/ai] error:", err);
    return NextResponse.json({ error: "Resume analysis failed. Please try again." }, { status: 500 });
  }
}