"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import {
  Command,
  LayoutGrid,
  KanbanSquare,
  Sparkles,
  Plus,
  Trash2,
  UploadCloud,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Download,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowUpRight,
  Inbox,
  TrendingUp,
  Award,
  CalendarClock,
  SendHorizontal,
  Building2,
  KeyRound,
  Bell,
  Shield,
  Gauge,
  Wand2,
} from "lucide-react";

/* ============================================================
   TYPES  (unchanged)
   ============================================================ */

type Status = "applied" | "oa" | "interview" | "rejected" | "offer";

interface Application {
  id: string;
  company: string;
  role: string;
  status: Status;
  created_at: string;
}

type StudioPhase = "idle" | "uploading" | "extracted" | "generating" | "done";

interface SectionFeedback {
  name: string;
  score: number;
  status: "Good" | "Needs Work" | "Missing";
  feedback: string;
  suggestions: string[];
}

interface AnalysisResult {
  overallScore: number;
  summary: string;
  sections: SectionFeedback[];
  missingKeywords: string[];
  quickWins: string[];
}

/* ============================================================
   STATUS META — same keys, monochrome palette + tiny accents
   ============================================================ */

type StatusMeta = {
  label: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
};

const STATUS_META: Record<Status, StatusMeta> = {
  applied: {
    label: "Applied",
    color: "#2563EB",
    bg: "#F5F8FF",
    border: "#E2E8F5",
    dot: "#2563EB",
  },
  oa: {
    label: "OA",
    color: "#111111",
    bg: "#F4F4F5",
    border: "#E4E4E7",
    dot: "#52525B",
  },
  interview: {
    label: "Interview",
    color: "#92400E",
    bg: "#FBF8F3",
    border: "#EDE6DA",
    dot: "#B45309",
  },
  rejected: {
    label: "Rejected",
    color: "#7A7A7A",
    bg: "#FAFAFA",
    border: "#E5E5E5",
    dot: "#A1A1AA",
  },
  offer: {
    label: "Offer",
    color: "#065F46",
    bg: "#F2FAF6",
    border: "#DDEFE5",
    dot: "#16A34A",
  },
};

const STATUSES = Object.keys(STATUS_META) as Status[];

/* ============================================================
   HOOKS  (business logic — UNCHANGED)
   ============================================================ */

function useTracker() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setApps(data as Application[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const addApplication = async () => {
    if (!company.trim() || !role.trim() || submitting) return;
    setSubmitting(true);
    try {
      await supabase.from("applications").insert([
        { company: company.trim(), role: role.trim(), status: "applied" },
      ]);
      setCompany("");
      setRole("");
      await fetchApps();
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: Status) => {
    await supabase.from("applications").update({ status }).eq("id", id);
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  };

  const deleteApp = async (id: string) => {
    await supabase.from("applications").delete().eq("id", id);
    setApps((prev) => prev.filter((a) => a.id !== id));
  };

  const stats = {
    total: apps.length,
    interviews: apps.filter((a) => a.status === "interview").length,
    offers: apps.filter((a) => a.status === "offer").length,
    rate: apps.length
      ? Math.round(
          (apps.filter((a) => ["interview", "offer"].includes(a.status))
            .length /
            apps.length) *
            100
        )
      : 0,
  };

  return {
    apps,
    loading,
    company,
    role,
    submitting,
    stats,
    setCompany,
    setRole,
    addApplication,
    updateStatus,
    deleteApp,
  };
}

function useStudio() {
  const [phase, setPhase] = useState<StudioPhase>("idle");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForNewFile = () => {
    setPhase("idle");
    setResumeText("");
    setAnalysis(null);
    setError("");
    setShowPreview(false);
  };

  const selectFile = (file: File | null) => {
    if (!file || file.type !== "application/pdf") {
      setError("Please select a valid PDF file.");
      return;
    }
    setResumeFile(file);
    resetForNewFile();
  };

  const uploadPDF = async () => {
    if (!resumeFile || phase === "uploading") return;
    setPhase("uploading");
    setError("");
    try {
      if (!(window as any).pdfjsLib) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load pdf.js"));
          document.head.appendChild(script);
        });
      }
      const pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

      const arrayBuffer = await resumeFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str).join(" ");
        fullText += pageText + "\n";
      }
      if (!fullText.trim()) {
        setError(
          "Could not extract text. Make sure this is a text-based PDF, not a scanned image."
        );
        setPhase("idle");
        return;
      }
      setResumeText(fullText.trim());
      setPhase("extracted");
    } catch (err) {
      setError("Failed to read PDF. Please try a different file.");
      setPhase("idle");
    }
  };

  const analyzeResume = async () => {
    if (!resumeText || !jobDesc.trim() || phase === "generating") return;
    setPhase("generating");
    setError("");
    setAnalysis(null);
    try {
      const prompt = `You are an expert ATS resume analyzer. Analyze the resume against the job description and return ONLY a valid JSON object (no markdown, no explanation).

RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDesc}

Return this exact JSON structure:
{
  "overallScore": <number 0-100>,
  "summary": "<2-3 sentence overall assessment>",
  "sections": [
    {
      "name": "<section name like Skills, Experience, Education, etc>",
      "score": <number 0-100>,
      "status": "<'Good' | 'Needs Work' | 'Missing'>",
      "feedback": "<specific feedback>",
      "suggestions": ["<suggestion 1>", "<suggestion 2>"]
    }
  ],
  "missingKeywords": ["<keyword1>", "<keyword2>"],
  "quickWins": ["<quick win 1>", "<quick win 2>"]
}`;

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Analysis failed. Please try again.");
        setPhase("extracted");
        return;
      }

      const textContent = data.text || "";
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");
      const result = JSON.parse(jsonMatch[0]) as AnalysisResult;
      setAnalysis(result);
      setPhase("done");
    } catch (err) {
      setError("Analysis failed. Please try again.");
      setPhase("extracted");
    }
  };

  const wordCount = (text: string) =>
    text.trim().split(/\s+/).filter(Boolean).length;

  return {
    phase,
    resumeFile,
    resumeText,
    jobDesc,
    analysis,
    error,
    showPreview,
    fileInputRef,
    setJobDesc,
    setShowPreview,
    selectFile,
    uploadPDF,
    analyzeResume,
    wordCount,
  };
}

/* ============================================================
   SHARED / REUSABLE UI PRIMITIVES
   ============================================================ */

type Tab = "dashboard" | "tracker" | "studio";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] },
  };
}

function IconBadge({
  icon: Icon,
  tone = "neutral",
}: {
  icon: typeof Sparkles;
  tone?: "neutral" | "blue" | "dark";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-[#F4F4F5] text-[#3F3F46] border border-[#E4E4E7]",
    blue: "bg-[#EFF4FF] text-[#2563EB] border border-[#DCE7FE]",
    dark: "bg-[#111111] text-white border border-[#111111]",
  };
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${tones[tone]}`}
    >
      <Icon className="h-4.5 w-4.5" strokeWidth={2} />
    </div>
  );
}

/* ============================================================
   NAVBAR — floating, blurred, command-menu feel
   ============================================================ */

function Navbar({
  activeTab,
  setActiveTab,
}: {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
}) {
  const items: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
    { id: "dashboard", label: "Overview", icon: LayoutGrid },
    { id: "tracker", label: "Tracker", icon: KanbanSquare },
    { id: "studio", label: "Resume Studio", icon: Sparkles },
  ];

  return (
    <div className="sticky top-0 z-50 flex justify-center px-4 pt-4">
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex w-full max-w-6xl items-center justify-between gap-4 rounded-2xl border border-[#EAEAEA]/80 bg-white/70 px-4 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.04)] backdrop-blur-xl"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#111111]">
            <Command className="h-4 w-4 text-white" strokeWidth={2.25} />
          </div>
          <span className="text-[14.5px] font-semibold tracking-tight text-[#111111]">
            ApplyOS
          </span>
        </div>

        <nav className="hidden items-center gap-0.5 rounded-full bg-[#F4F4F5]/80 p-1 sm:flex">
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className="relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200"
              >
                {active && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span
                  className={`relative z-10 flex items-center gap-1.5 ${
                    active
                      ? "text-[#111111]"
                      : "text-[#71717A] hover:text-[#111111]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2.1} />
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5">
          <button className="hidden h-8 w-8 items-center justify-center rounded-full text-[#71717A] transition-colors hover:bg-[#F4F4F5] hover:text-[#111111] sm:flex">
            <Bell className="h-4 w-4" strokeWidth={2} />
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111111] text-[11.5px] font-semibold text-white">
            A
          </div>
        </div>
      </motion.header>

      {/* mobile tabs */}
      <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-full border border-[#EAEAEA] bg-white/90 p-1 shadow-lg backdrop-blur-xl sm:hidden">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-medium transition-colors ${
                active ? "bg-[#111111] text-white" : "text-[#71717A]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   HERO — editorial left, live product mockup right
   ============================================================ */

function HeroMockup({ stats }: { stats: { rate: number } }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto w-full max-w-md"
    >
      {/* ambient glow */}
      <div className="absolute -inset-10 -z-10 rounded-full bg-gradient-to-br from-[#2563EB]/10 via-transparent to-transparent blur-3xl" />

      {/* back card: kanban sliver */}
      <motion.div
        initial={{ opacity: 0, x: 24, rotate: 4 }}
        animate={{ opacity: 1, x: 0, rotate: 4 }}
        transition={{ duration: 0.7, delay: 0.25 }}
        className="absolute -right-6 top-10 w-56 rounded-2xl border border-[#ECECEC] bg-white p-4 shadow-[0_20px_45px_rgba(0,0,0,0.08)]"
      >
        <p className="mb-3 text-[11px] font-medium text-[#A1A1AA]">Interview</p>
        <div className="space-y-2">
          <div className="rounded-lg border border-[#F0F0F0] bg-[#FAFAFA] p-2.5">
            <p className="text-[11.5px] font-semibold text-[#111111]">Stripe</p>
            <p className="text-[10.5px] text-[#A1A1AA]">Product Designer</p>
          </div>
          <div className="rounded-lg border border-[#F0F0F0] bg-[#FAFAFA] p-2.5 opacity-70">
            <p className="text-[11.5px] font-semibold text-[#111111]">Linear</p>
            <p className="text-[10.5px] text-[#A1A1AA]">Frontend Eng.</p>
          </div>
        </div>
      </motion.div>

      {/* main card: ATS score */}
      <div className="relative rounded-[22px] border border-[#ECECEC] bg-white p-6 shadow-[0_30px_60px_rgba(0,0,0,0.09)]">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#DCE7FE] bg-[#EFF4FF] px-2.5 py-1 text-[10.5px] font-medium text-[#2563EB]">
            <Sparkles className="h-3 w-3" /> AI Analysis
          </span>
          <span className="text-[10.5px] text-[#A1A1AA]">Live</span>
        </div>

        <div className="mt-6 flex items-end gap-3">
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            className="text-[54px] font-semibold leading-none tracking-tight text-[#111111]"
          >
            94
          </motion.span>
          <span className="mb-1.5 text-[13px] font-medium text-[#A1A1AA]">
            / 100 ATS score
          </span>
        </div>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "94%" }}
            transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full bg-[#111111]"
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          {[
            { label: "Skills", v: 96 },
            { label: "Experience", v: 91 },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-[#F0F0F0] bg-[#FAFAFA] p-3"
            >
              <p className="text-[10.5px] font-medium text-[#A1A1AA]">
                {s.label}
              </p>
              <p className="mt-0.5 text-[15px] font-semibold text-[#111111]">
                {s.v}
                <span className="text-[11px] font-medium text-[#A1A1AA]">
                  /100
                </span>
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#DDEFE5] bg-[#F2FAF6] px-3 py-2.5">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#16A34A]" />
          <p className="text-[11.5px] text-[#065F46]">
            Strong keyword match — 3 quick wins found
          </p>
        </div>
      </div>

      {/* floating response-rate chip */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="absolute -left-8 -top-6 flex items-center gap-2 rounded-full border border-[#ECECEC] bg-white px-3.5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.07)]"
      >
        <TrendingUp className="h-3.5 w-3.5 text-[#2563EB]" />
        <span className="text-[11.5px] font-semibold text-[#111111]">
          {stats.rate}%
        </span>
        <span className="text-[10.5px] text-[#A1A1AA]">response rate</span>
      </motion.div>
    </motion.div>
  );
}

function Hero({
  setActiveTab,
  stats,
}: {
  setActiveTab: (t: Tab) => void;
  stats: { total: number; interviews: number; offers: number; rate: number };
}) {
  const badges = [
    { icon: Gauge, label: "Instant ATS scoring" },
    { icon: Wand2, label: "AI-tailored rewrites" },
    { icon: Shield, label: "Private by default" },
  ];

  return (
    <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-6 pb-20 pt-16 sm:pt-24 lg:grid-cols-2 lg:gap-10">
      <div>
        <motion.span
          {...fadeUp(0)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-[12px] font-medium text-[#71717A] shadow-sm"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
          The operating system for job seekers
        </motion.span>

        <motion.h1
          {...fadeUp(0.08)}
          className="mt-6 text-[38px] font-semibold leading-[1.06] tracking-[-0.02em] text-[#111111] sm:text-[52px]"
        >
          Every application,
          <br />
          engineered to land.
        </motion.h1>

        <motion.p
          {...fadeUp(0.16)}
          className="mt-5 max-w-md text-[16px] leading-relaxed text-[#71717A]"
        >
          ApplyOS scores your resume against any job description, tells you
          exactly what to fix, and keeps every application organized in one
          calm workspace.
        </motion.p>

        <motion.div {...fadeUp(0.24)} className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={() => setActiveTab("studio")}
            className="group inline-flex items-center gap-2 rounded-xl bg-[#111111] px-5 py-3 text-[13.5px] font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.1)] transition-all hover:bg-[#262626] active:scale-[0.98]"
          >
            <Sparkles className="h-4 w-4" />
            Analyze my resume
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            onClick={() => setActiveTab("tracker")}
            className="inline-flex items-center gap-2 rounded-xl border border-[#EAEAEA] bg-white px-5 py-3 text-[13.5px] font-medium text-[#111111] transition-all hover:border-[#D4D4D8] hover:bg-[#FAFAFA] active:scale-[0.98]"
          >
            <KanbanSquare className="h-4 w-4" />
            View tracker
          </button>
        </motion.div>

        <motion.div
          {...fadeUp(0.32)}
          className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[#EFEFEF] pt-6"
        >
          {badges.map((b) => {
            const Icon = b.icon;
            return (
              <div
                key={b.label}
                className="flex items-center gap-2 text-[12.5px] font-medium text-[#71717A]"
              >
                <Icon className="h-3.5 w-3.5 text-[#111111]" strokeWidth={2} />
                {b.label}
              </div>
            );
          })}
        </motion.div>
      </div>

      <HeroMockup stats={stats} />
    </section>
  );
}

/* ============================================================
   STATS CARDS — premium, monochrome, animated
   ============================================================ */

function AnimatedNumber({ value }: { value: number }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {value}
    </motion.span>
  );
}

function StatsCards({
  stats,
}: {
  stats: { total: number; interviews: number; offers: number; rate: number };
}) {
  const cards = [
    {
      label: "Total applied",
      value: stats.total,
      icon: SendHorizontal,
      tone: "blue" as const,
    },
    {
      label: "Interviews",
      value: stats.interviews,
      icon: CalendarClock,
      tone: "neutral" as const,
    },
    {
      label: "Offers",
      value: stats.offers,
      icon: Award,
      tone: "dark" as const,
    },
    {
      label: "Response rate",
      value: `${stats.rate}%`,
      icon: TrendingUp,
      tone: "neutral" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <motion.div
            key={c.label}
            {...fadeUp(i * 0.06)}
            whileHover={{ y: -3 }}
            className="group rounded-2xl border border-[#EDEDED] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-shadow duration-200 hover:shadow-[0_16px_36px_rgba(0,0,0,0.06)]"
          >
            <IconBadge icon={Icon} tone={c.tone} />
            <p className="mt-4 text-[27px] font-semibold leading-none tracking-tight text-[#111111]">
              {typeof c.value === "number" ? (
                <AnimatedNumber value={c.value} />
              ) : (
                c.value
              )}
            </p>
            <p className="mt-2 text-[12.5px] font-medium text-[#A1A1AA]">
              {c.label}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ============================================================
   EMPTY STATE
   ============================================================ */

function EmptyState({
  icon: Icon,
  title,
  subtitle,
  cta,
}: {
  icon: typeof Inbox;
  title: string;
  subtitle: string;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <motion.div
      {...fadeUp(0)}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E4E4E7] bg-[#FAFAFA] px-6 py-16 text-center"
    >
      <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#ECECEC] bg-white shadow-sm">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#2563EB]/5 to-transparent" />
        <Icon className="relative h-6 w-6 text-[#A1A1AA]" strokeWidth={1.5} />
      </div>
      <p className="text-[14.5px] font-semibold text-[#111111]">{title}</p>
      <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-[#A1A1AA]">
        {subtitle}
      </p>
      {cta && (
        <button
          onClick={cta.onClick}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[#111111] px-4 py-2 text-[12.5px] font-medium text-white transition-all hover:bg-[#262626] active:scale-[0.98]"
        >
          {cta.label}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </motion.div>
  );
}

/* ============================================================
   KANBAN CARD + BOARD
   ============================================================ */

function KanbanCard({
  app,
  updateStatus,
  deleteApp,
}: {
  app: Application;
  updateStatus: (id: string, status: Status) => void;
  deleteApp: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const date = new Date(app.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      whileHover={{ y: -2 }}
      className="group relative rounded-xl border border-[#EDEDED] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-shadow duration-200 hover:shadow-[0_14px_30px_rgba(0,0,0,0.07)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F4F4F5] text-[#71717A]">
            <Building2 className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold text-[#111111]">
              {app.company}
            </p>
            <p className="truncate text-[12px] text-[#A1A1AA]">{app.role}</p>
          </div>
        </div>
        <button
          onClick={() => deleteApp(app.id)}
          aria-label={`Remove ${app.company} application`}
          className="shrink-0 rounded-md p-1 text-[#D4D4D8] opacity-0 transition-all hover:bg-[#FDF2F2] hover:text-[#DC2626] group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3.5 flex items-center justify-between">
        <span className="text-[11px] text-[#A1A1AA]">{date}</span>
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-transform active:scale-95"
            style={{
              color: STATUS_META[app.status].color,
              background: STATUS_META[app.status].bg,
              border: `1px solid ${STATUS_META[app.status].border}`,
            }}
          >
            {STATUS_META[app.status].label}
          </button>
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 z-20 mt-1.5 w-36 overflow-hidden rounded-lg border border-[#EDEDED] bg-white py-1 shadow-lg"
              >
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      updateStatus(app.id, s);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#3F3F46] hover:bg-[#FAFAFA]"
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: STATUS_META[s].dot }}
                    />
                    {STATUS_META[s].label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function TrackerBoard({
  tracker,
}: {
  tracker: ReturnType<typeof useTracker>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <StatsCards stats={tracker.stats} />

      <div className="rounded-2xl border border-[#EDEDED] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-6">
        <h2 className="mb-4 text-[14px] font-semibold text-[#111111]">
          Add application
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="flex-1 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3.5 py-2.5 text-[13.5px] text-[#111111] outline-none transition-colors placeholder:text-[#A1A1AA] focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10"
            placeholder="Company name"
            value={tracker.company}
            onChange={(e) => tracker.setCompany(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tracker.addApplication()}
          />
          <input
            className="flex-1 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3.5 py-2.5 text-[13.5px] text-[#111111] outline-none transition-colors placeholder:text-[#A1A1AA] focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10"
            placeholder="Role / position"
            value={tracker.role}
            onChange={(e) => tracker.setRole(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tracker.addApplication()}
          />
          <button
            onClick={tracker.addApplication}
            disabled={
              tracker.submitting ||
              !tracker.company.trim() ||
              !tracker.role.trim()
            }
            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#111111] px-4 py-2.5 text-[13.5px] font-medium text-white transition-all hover:bg-[#262626] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {tracker.submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Add
          </button>
        </div>
      </div>

      {tracker.loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-40 rounded-2xl border border-[#EDEDED] bg-white p-4"
            >
              <div className="h-full w-full animate-shimmer rounded-lg bg-gradient-to-r from-[#F4F4F5] via-[#EDEDED] to-[#F4F4F5] bg-[length:200%_100%]" />
            </div>
          ))}
        </div>
      ) : tracker.apps.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No applications yet"
          subtitle="Add your first application above to start tracking your pipeline."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STATUSES.map((status) => {
            const apps = tracker.apps.filter((a) => a.status === status);
            const meta = STATUS_META[status];
            return (
              <div key={status} className="flex min-w-0 flex-col gap-3">
                <div className="flex items-center justify-between px-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: meta.dot }}
                    />
                    <span className="text-[12.5px] font-semibold text-[#111111]">
                      {meta.label}
                    </span>
                  </div>
                  <span className="rounded-full bg-[#F4F4F5] px-1.5 py-0.5 text-[10.5px] font-medium text-[#A1A1AA]">
                    {apps.length}
                  </span>
                </div>
                <div className="flex min-h-[100px] flex-col gap-2.5 rounded-2xl bg-[#FAFAFA] p-2">
                  <AnimatePresence mode="popLayout">
                    {apps.length === 0 ? (
                      <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-[#E4E4E7] text-[11px] text-[#A1A1AA]">
                        Empty
                      </div>
                    ) : (
                      apps.map((app) => (
                        <KanbanCard
                          key={app.id}
                          app={app}
                          updateStatus={tracker.updateStatus}
                          deleteApp={tracker.deleteApp}
                        />
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   RESUME STUDIO — uploader + preview
   ============================================================ */

function ResumeUploader({ studio }: { studio: ReturnType<typeof useStudio> }) {
  const steps = [
    { n: 1, label: "Upload", done: studio.phase !== "idle" },
    {
      n: 2,
      label: "Job description",
      done: !!studio.jobDesc.trim() && studio.phase !== "idle",
    },
    { n: 3, label: "Analyze", done: studio.phase === "done" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-2xl border border-[#EDEDED] bg-white p-4">
        {steps.map((s, i) => (
          <div key={s.n} className="flex flex-1 items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                  s.done
                    ? "bg-[#111111] text-white"
                    : "bg-[#F4F4F5] text-[#A1A1AA]"
                }`}
              >
                {s.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.n}
              </div>
              <span
                className={`hidden text-[12px] font-medium sm:inline ${
                  s.done ? "text-[#111111]" : "text-[#A1A1AA]"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-px flex-1 ${
                  s.done ? "bg-[#111111]/25" : "bg-[#EDEDED]"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[#EDEDED] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-6">
        <h2 className="mb-1 text-[14px] font-semibold text-[#111111]">
          1 — Upload resume
        </h2>
        <p className="mb-4 text-[12.5px] text-[#A1A1AA]">
          Text-based PDFs only. No scanned images.
        </p>

        <div
          onClick={() => studio.fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            studio.selectFile(e.dataTransfer.files[0] ?? null);
          }}
          className={`flex min-h-[130px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200 ${
            studio.resumeFile
              ? "border-[#2563EB]/25 bg-[#F5F8FF]"
              : "border-[#E4E4E7] hover:border-[#2563EB]/30 hover:bg-[#FAFAFA]"
          }`}
        >
          <input
            ref={studio.fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => studio.selectFile(e.target.files?.[0] ?? null)}
          />
          {studio.resumeFile ? (
            <div className="flex w-full items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#2563EB] shadow-sm">
                <FileText className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 text-left">
                <p className="truncate text-[13px] font-medium text-[#111111]">
                  {studio.resumeFile.name}
                </p>
                <p className="text-[11.5px] text-[#A1A1AA]">
                  {(studio.resumeFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <span className="ml-auto shrink-0 text-[11px] text-[#A1A1AA]">
                Click to change
              </span>
            </div>
          ) : (
            <>
              <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-[#F4F4F5] text-[#71717A]">
                <UploadCloud className="h-4.5 w-4.5" />
              </div>
              <p className="text-[13px] font-medium text-[#3F3F46]">
                Drop your resume here, or click to browse
              </p>
              <p className="mt-1 text-[11.5px] text-[#A1A1AA]">PDF only</p>
            </>
          )}
        </div>

        <button
          onClick={studio.uploadPDF}
          disabled={!studio.resumeFile || studio.phase === "uploading"}
          className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#111111] px-4 py-2.5 text-[13.5px] font-medium text-white transition-all hover:bg-[#262626] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {studio.phase === "uploading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Extracting…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Extract resume text
            </>
          )}
        </button>

        <AnimatePresence>
          {(studio.phase === "extracted" ||
            studio.phase === "generating" ||
            studio.phase === "done") && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3.5 flex items-center gap-2 rounded-lg border border-[#DDEFE5] bg-[#F2FAF6] px-3.5 py-2.5 text-[12.5px] text-[#065F46]"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="flex-1">
                {studio.wordCount(studio.resumeText).toLocaleString()} words
                extracted
              </span>
              <button
                onClick={() => studio.setShowPreview((v) => !v)}
                className="flex items-center gap-1 font-medium underline-offset-2 hover:underline"
              >
                {studio.showPreview ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" /> Hide
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {studio.showPreview && studio.resumeText && (
          <pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-[#EDEDED] bg-[#FAFAFA] p-3.5 text-[11.5px] leading-relaxed text-[#71717A]">
            {studio.resumeText.slice(0, 1500)}
            {studio.resumeText.length > 1500 ? "\n\n… (truncated)" : ""}
          </pre>
        )}

        {studio.error && studio.phase === "idle" && (
          <div className="mt-3.5 flex items-center gap-2 rounded-lg border border-[#F5D5D5] bg-[#FDF2F2] px-3.5 py-2.5 text-[12.5px] text-[#DC2626]">
            <XCircle className="h-4 w-4 shrink-0" />
            {studio.error}
          </div>
        )}
      </div>

      <div
        className={`relative rounded-2xl border border-[#EDEDED] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-6 ${
          studio.phase === "idle" ? "opacity-50" : ""
        }`}
      >
        {studio.phase === "idle" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/50 text-[12.5px] font-medium text-[#A1A1AA] backdrop-blur-[1px]">
            Extract your resume first
          </div>
        )}
        <h2 className="mb-3 text-[14px] font-semibold text-[#111111]">
          2 — Paste job description
        </h2>
        <textarea
          className="w-full resize-y rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3.5 py-3 text-[13px] leading-relaxed text-[#111111] outline-none transition-colors placeholder:text-[#A1A1AA] focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10 disabled:cursor-not-allowed"
          placeholder="Paste the full job description here. More detail = better analysis."
          value={studio.jobDesc}
          onChange={(e) => studio.setJobDesc(e.target.value)}
          disabled={studio.phase === "idle" || studio.phase === "uploading"}
          rows={7}
        />
        <p className="mt-1.5 text-right text-[11px] text-[#A1A1AA]">
          {studio.wordCount(studio.jobDesc).toLocaleString()} words
        </p>
      </div>

      <div
        className={`relative rounded-2xl border border-[#EDEDED] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-6 ${
          studio.phase === "idle" || !studio.jobDesc.trim() ? "opacity-50" : ""
        }`}
      >
        {(studio.phase === "idle" || !studio.jobDesc.trim()) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/50 text-[12.5px] font-medium text-[#A1A1AA] backdrop-blur-[1px]">
            Complete steps 1 &amp; 2 first
          </div>
        )}
        <h2 className="mb-3 text-[14px] font-semibold text-[#111111]">
          3 — Analyze resume
        </h2>
        <button
          onClick={studio.analyzeResume}
          disabled={
            studio.phase === "idle" ||
            !studio.jobDesc.trim() ||
            studio.phase === "generating" ||
            studio.phase === "uploading"
          }
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 py-3 text-[13.5px] font-medium text-white shadow-sm transition-all hover:bg-[#1D4ED8] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {studio.phase === "generating" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Analyzing your
              resume…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Analyze against job description
            </>
          )}
        </button>
        {studio.phase === "generating" && (
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#F4F4F5]">
            <div className="h-full w-1/3 animate-progress rounded-full bg-[#2563EB]" />
          </div>
        )}
        {studio.error &&
          (studio.phase === "extracted" || studio.phase === "done") && (
            <div className="mt-3.5 flex items-center gap-2 rounded-lg border border-[#F5D5D5] bg-[#FDF2F2] px-3.5 py-2.5 text-[12.5px] text-[#DC2626]">
              <XCircle className="h-4 w-4 shrink-0" />
              {studio.error}
            </div>
          )}
      </div>
    </div>
  );
}

function ResumePreview({ studio }: { studio: ReturnType<typeof useStudio> }) {
  const { analysis } = studio;

  if (!analysis) {
    return (
      <div className="sticky top-24 flex h-full min-h-[420px] flex-col justify-center rounded-2xl border border-[#EDEDED] bg-white p-6">
        <EmptyState
          icon={FileText}
          title="Your analysis will appear here"
          subtitle="Upload a resume and paste a job description to get an ATS score, section feedback, and quick wins."
        />
      </div>
    );
  }

  const statusStyle = (status: SectionFeedback["status"]) => {
    if (status === "Good")
      return { color: "#065F46", bg: "#F2FAF6", border: "#DDEFE5" };
    if (status === "Needs Work")
      return { color: "#92400E", bg: "#FBF8F3", border: "#EDE6DA" };
    return { color: "#DC2626", bg: "#FDF2F2", border: "#F5D5D5" };
  };

  return (
    <div className="flex flex-col gap-5">
      <motion.div
        {...fadeUp(0)}
        className="rounded-2xl border border-[#EDEDED] bg-white p-6 text-center shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#DCE7FE] bg-[#EFF4FF] px-3 py-1 text-[11.5px] font-medium text-[#2563EB]">
          <KeyRound className="h-3 w-3" /> ATS Match Score
        </span>
        <div className="mt-4 text-[56px] font-semibold leading-none tracking-tight text-[#111111]">
          {analysis.overallScore}
          <span className="text-[22px] font-medium text-[#A1A1AA]">/100</span>
        </div>
        <div className="mx-auto mt-4 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[#F4F4F5]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${analysis.overallScore}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full bg-[#111111]"
          />
        </div>
        <p className="mx-auto mt-4 max-w-md text-[13px] leading-relaxed text-[#71717A]">
          {analysis.summary}
        </p>
        <button className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#111111] px-4 py-2.5 text-[13px] font-medium text-white transition-all hover:bg-[#262626] active:scale-[0.98]">
          <Download className="h-4 w-4" /> Download ATS-ready PDF
        </button>
      </motion.div>

      <div className="max-h-[560px] overflow-y-auto rounded-2xl border border-[#EDEDED] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-6">
        <h2 className="mb-4 text-[14px] font-semibold text-[#111111]">
          Section-by-section feedback
        </h2>
        <div className="flex flex-col gap-3">
          {analysis.sections.map((sec, idx) => {
            const st = statusStyle(sec.status);
            return (
              <motion.div
                key={sec.name}
                {...fadeUp(idx * 0.05)}
                className="rounded-xl border border-[#EDEDED] bg-[#FAFAFA] p-4"
              >
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-[#111111]">
                    {sec.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                      style={{
                        color: st.color,
                        background: st.bg,
                        border: `1px solid ${st.border}`,
                      }}
                    >
                      {sec.status}
                    </span>
                    <span className="text-[12.5px] font-semibold text-[#111111]">
                      {sec.score}/100
                    </span>
                  </div>
                </div>
                <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-[#EDEDED]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${sec.score}%` }}
                    transition={{ duration: 0.7, delay: 0.1 }}
                    className="h-full rounded-full"
                    style={{ background: st.color }}
                  />
                </div>
                <p className="mb-2.5 text-[12.5px] leading-relaxed text-[#71717A]">
                  {sec.feedback}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {sec.suggestions.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[12px] text-[#3F3F46]"
                    >
                      <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-[#2563EB]" />
                      {s}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#EDEDED] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <h2 className="mb-3 text-[13.5px] font-semibold text-[#111111]">
            Missing keywords
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {analysis.missingKeywords.map((kw) => (
              <span
                key={kw}
                className="rounded-full border border-[#F5D5D5] bg-[#FDF2F2] px-2.5 py-1 text-[11.5px] font-medium text-[#DC2626]"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[#EDEDED] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <h2 className="mb-3 text-[13.5px] font-semibold text-[#111111]">
            Quick wins
          </h2>
          <ul className="flex flex-col gap-2">
            {analysis.quickWins.map((win, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[12px] leading-relaxed text-[#3F3F46]"
              >
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16A34A]" />
                {win}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-[#EFEFEF] py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-[12.5px] text-[#A1A1AA] sm:flex-row">
        <span>© {new Date().getFullYear()} ApplyOS. Your career companion.</span>
        <span className="flex items-center gap-1.5">
          Built with <Sparkles className="h-3 w-3 text-[#2563EB]" /> and intent.
        </span>
      </div>
    </footer>
  );
}

/* ============================================================
   PAGE
   ============================================================ */

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const tracker = useTracker();
  const studio = useStudio();

  return (
    <div className="min-h-screen bg-[#FAFAFA] antialiased">
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .animate-shimmer { animation: shimmer 1.4s infinite; }
        @keyframes progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        .animate-progress { animation: progress 1.2s ease-in-out infinite; }
      `}</style>

      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {activeTab === "dashboard" && (
        <Hero setActiveTab={setActiveTab} stats={tracker.stats} />
      )}

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-6">
        {activeTab === "dashboard" && (
          <div className="flex flex-col gap-10">
            <div>
              <h2 className="mb-5 text-[13px] font-semibold uppercase tracking-wide text-[#A1A1AA]">
                Your pipeline
              </h2>
              <StatsCards stats={tracker.stats} />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <motion.div
                {...fadeUp(0)}
                whileHover={{ y: -3 }}
                className="group rounded-2xl border border-[#EDEDED] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-shadow hover:shadow-[0_20px_40px_rgba(0,0,0,0.07)]"
              >
                <IconBadge icon={KanbanSquare} tone="blue" />
                <h3 className="mb-1.5 mt-4 text-[15.5px] font-semibold text-[#111111]">
                  Job Tracker
                </h3>
                <p className="mb-5 text-[13px] leading-relaxed text-[#71717A]">
                  Manage every application on a Kanban board — from applied to
                  offer.
                </p>
                <button
                  onClick={() => setActiveTab("tracker")}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#111111]"
                >
                  Open tracker
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </motion.div>

              <motion.div
                {...fadeUp(0.08)}
                whileHover={{ y: -3 }}
                className="group rounded-2xl border border-[#EDEDED] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-shadow hover:shadow-[0_20px_40px_rgba(0,0,0,0.07)]"
              >
                <IconBadge icon={Sparkles} tone="dark" />
                <h3 className="mb-1.5 mt-4 text-[15.5px] font-semibold text-[#111111]">
                  AI Resume Studio
                </h3>
                <p className="mb-5 text-[13px] leading-relaxed text-[#71717A]">
                  Get an ATS score, section feedback, and keyword gaps in
                  seconds.
                </p>
                <button
                  onClick={() => setActiveTab("studio")}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#111111]"
                >
                  Open studio
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </motion.div>
            </div>
          </div>
        )}

        {activeTab === "tracker" && (
          <div className="flex flex-col gap-6">
            <motion.div {...fadeUp(0)}>
              <h1 className="text-[28px] font-semibold tracking-tight text-[#111111]">
                Job Tracker
              </h1>
              <p className="mt-1 text-[13.5px] text-[#71717A]">
                Manage all your job applications in one place.
              </p>
            </motion.div>
            <TrackerBoard tracker={tracker} />
          </div>
        )}

        {activeTab === "studio" && (
          <div className="flex flex-col gap-6">
            <motion.div {...fadeUp(0)}>
              <h1 className="text-[28px] font-semibold tracking-tight text-[#111111]">
                AI Resume Studio
              </h1>
              <p className="mt-1 text-[13.5px] text-[#71717A]">
                Upload your resume and match it against any job description.
              </p>
            </motion.div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ResumeUploader studio={studio} />
              <ResumePreview studio={studio} />
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}