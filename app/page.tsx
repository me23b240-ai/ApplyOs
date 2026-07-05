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
  Sun,
  Moon,
} from "lucide-react";

/* ============================================================
   EASE — typed tuple (fixes framer-motion TS build error)
   ============================================================ */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay, ease: EASE },
  };
}

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

type Theme = "light" | "dark";

/* ============================================================
   STATUS META — colors only; bg/border derived via alpha
   (works automatically in both light & dark themes)
   ============================================================ */

type StatusMeta = { label: string; color: string };

const STATUS_META: Record<Status, StatusMeta> = {
  applied: { label: "Applied", color: "#2563EB" },
  oa: { label: "OA", color: "#71717A" },
  interview: { label: "Interview", color: "#D97706" },
  rejected: { label: "Rejected", color: "#DC2626" },
  offer: { label: "Offer", color: "#16A34A" },
};

const STATUSES = Object.keys(STATUS_META) as Status[];

function pillStyle(color: string) {
  return {
    color,
    background: `${color}1A`,
    border: `1px solid ${color}33`,
  };
}

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
   THEME HOOK
   ============================================================ */

function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("applyos-theme") as Theme | null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem("applyos-theme", theme);
  }, [theme, mounted]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return { theme, toggleTheme };
}

/* ============================================================
   THEME TOGGLE BUTTON
   ============================================================ */

function ThemeToggle({
  theme,
  toggleTheme,
}: {
  theme: Theme;
  toggleTheme: () => void;
}) {
  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--subtle-2)] hover:text-[var(--text)]"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
          transition={{ duration: 0.25 }}
          className="flex items-center justify-center"
        >
          {theme === "light" ? (
            <Moon className="h-4 w-4" strokeWidth={2} />
          ) : (
            <Sun className="h-4 w-4" strokeWidth={2} />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/* ============================================================
   SHARED / REUSABLE UI PRIMITIVES
   ============================================================ */

type Tab = "dashboard" | "tracker" | "studio";

function IconBadge({
  icon: Icon,
  tone = "neutral",
}: {
  icon: typeof Sparkles;
  tone?: "neutral" | "blue" | "dark";
}) {
  const tones: Record<string, React.CSSProperties> = {
    neutral: {
      background: "var(--subtle-2)",
      color: "var(--text-2)",
      border: "1px solid var(--border-strong)",
    },
    blue: {
      background: "var(--accent-bg)",
      color: "var(--accent)",
      border: "1px solid var(--accent-border)",
    },
    dark: {
      background: "var(--btn-bg)",
      color: "var(--btn-text)",
      border: "1px solid var(--btn-bg)",
    },
  };
  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-[10px]"
      style={tones[tone]}
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
  theme,
  toggleTheme,
}: {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  theme: Theme;
  toggleTheme: () => void;
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
        transition={{ duration: 0.5, ease: EASE }}
        className="flex w-full max-w-6xl items-center justify-between gap-4 rounded-2xl border px-4 py-2.5 shadow-[0_8px_30px_var(--shadow-sm)] backdrop-blur-xl"
        style={{
          borderColor: "var(--border)",
          background: "var(--nav-bg)",
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[9px]"
            style={{ background: "var(--btn-bg)" }}
          >
            <Command
              className="h-4 w-4"
              style={{ color: "var(--btn-text)" }}
              strokeWidth={2.25}
            />
          </div>
          <span className="text-[14.5px] font-semibold tracking-tight text-[var(--text)]">
            ApplyOS
          </span>
        </div>

        <nav
          className="hidden items-center gap-0.5 rounded-full p-1 sm:flex"
          style={{ background: "var(--subtle-2)" }}
        >
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
                    className="absolute inset-0 rounded-full shadow-[0_1px_3px_var(--shadow-sm)]"
                    style={{ background: "var(--card)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span
                  className="relative z-10 flex items-center gap-1.5"
                  style={{ color: active ? "var(--text)" : "var(--muted)" }}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2.1} />
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5">
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <button
            className="hidden h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--subtle-2)] hover:text-[var(--text)] sm:flex"
          >
            <Bell className="h-4 w-4" strokeWidth={2} />
          </button>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-[11.5px] font-semibold"
            style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
          >
            A
          </div>
        </div>
      </motion.header>

      {/* mobile tabs */}
      <div
        className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-full border p-1 shadow-lg backdrop-blur-xl sm:hidden"
        style={{ borderColor: "var(--border)", background: "var(--nav-bg)" }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-medium transition-colors"
              style={{
                background: active ? "var(--btn-bg)" : "transparent",
                color: active ? "var(--btn-text)" : "var(--muted)",
              }}
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
      transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
      className="relative mx-auto w-full max-w-md"
    >
      {/* ambient glow */}
      <div
        className="absolute -inset-10 -z-10 rounded-full blur-3xl"
        style={{ background: "var(--glow)" }}
      />

      {/* back card: kanban sliver */}
      <motion.div
        initial={{ opacity: 0, x: 24, rotate: 4 }}
        animate={{ opacity: 1, x: 0, rotate: 4 }}
        transition={{ duration: 0.7, delay: 0.25 }}
        className="absolute -right-6 top-10 w-56 rounded-2xl border p-4 shadow-[0_20px_45px_var(--shadow-md)]"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <p className="mb-3 text-[11px] font-medium text-[var(--muted-2)]">
          Interview
        </p>
        <div className="space-y-2">
          <div
            className="rounded-lg border p-2.5"
            style={{ borderColor: "var(--border)", background: "var(--subtle)" }}
          >
            <p className="text-[11.5px] font-semibold text-[var(--text)]">
              Stripe
            </p>
            <p className="text-[10.5px] text-[var(--muted-2)]">
              Product Designer
            </p>
          </div>
          <div
            className="rounded-lg border p-2.5 opacity-70"
            style={{ borderColor: "var(--border)", background: "var(--subtle)" }}
          >
            <p className="text-[11.5px] font-semibold text-[var(--text)]">
              Linear
            </p>
            <p className="text-[10.5px] text-[var(--muted-2)]">Frontend Eng.</p>
          </div>
        </div>
      </motion.div>

      {/* main card: ATS score */}
      <div
        className="relative rounded-[22px] border p-6 shadow-[0_30px_60px_var(--shadow-lg)]"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <div className="flex items-center justify-between">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium"
            style={{
              borderColor: "var(--accent-border)",
              background: "var(--accent-bg)",
              color: "var(--accent)",
            }}
          >
            <Sparkles className="h-3 w-3" /> AI Analysis
          </span>
          <span className="text-[10.5px] text-[var(--muted-2)]">Live</span>
        </div>

        <div className="mt-6 flex items-end gap-3">
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            className="text-[54px] font-semibold leading-none tracking-tight text-[var(--text)]"
          >
            94
          </motion.span>
          <span className="mb-1.5 text-[13px] font-medium text-[var(--muted-2)]">
            / 100 ATS score
          </span>
        </div>

        <div
          className="mt-4 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--subtle-2)" }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "94%" }}
            transition={{ duration: 1, delay: 0.5, ease: EASE }}
            className="h-full rounded-full"
            style={{ background: "var(--btn-bg)" }}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          {[
            { label: "Skills", v: 96 },
            { label: "Experience", v: 91 },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border p-3"
              style={{ borderColor: "var(--border)", background: "var(--subtle)" }}
            >
              <p className="text-[10.5px] font-medium text-[var(--muted-2)]">
                {s.label}
              </p>
              <p className="mt-0.5 text-[15px] font-semibold text-[var(--text)]">
                {s.v}
                <span className="text-[11px] font-medium text-[var(--muted-2)]">
                  /100
                </span>
              </p>
            </div>
          ))}
        </div>

        <div
          className="mt-4 flex items-center gap-2 rounded-xl border px-3 py-2.5"
          style={{
            borderColor: "var(--success-border)",
            background: "var(--success-bg)",
          }}
        >
          <CheckCircle2
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: "var(--success)" }}
          />
          <p className="text-[11.5px]" style={{ color: "var(--success-text)" }}>
            Strong keyword match — 3 quick wins found
          </p>
        </div>
      </div>

      {/* floating response-rate chip */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="absolute -left-8 -top-6 flex items-center gap-2 rounded-full border px-3.5 py-2 shadow-[0_10px_30px_var(--shadow-md)]"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <TrendingUp className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
        <span className="text-[11.5px] font-semibold text-[var(--text)]">
          {stats.rate}%
        </span>
        <span className="text-[10.5px] text-[var(--muted-2)]">
          response rate
        </span>
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
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium shadow-sm"
          style={{
            borderColor: "var(--border)",
            background: "var(--card)",
            color: "var(--muted)",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--accent)" }}
          />
          The operating system for job seekers
        </motion.span>

        <motion.h1
          {...fadeUp(0.08)}
          className="mt-6 text-[38px] font-semibold leading-[1.06] tracking-[-0.02em] text-[var(--text)] sm:text-[52px]"
        >
          Every application,
          <br />
          engineered to land.
        </motion.h1>

        <motion.p
          {...fadeUp(0.16)}
          className="mt-5 max-w-md text-[16px] leading-relaxed text-[var(--muted)]"
        >
          ApplyOS scores your resume against any job description, tells you
          exactly what to fix, and keeps every application organized in one
          calm workspace.
        </motion.p>

        <motion.div {...fadeUp(0.24)} className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={() => setActiveTab("studio")}
            className="group inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[13.5px] font-medium shadow-sm transition-all active:scale-[0.98]"
            style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
          >
            <Sparkles className="h-4 w-4" />
            Analyze my resume
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            onClick={() => setActiveTab("tracker")}
            className="inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-[13.5px] font-medium transition-all active:scale-[0.98]"
            style={{
              borderColor: "var(--border)",
              background: "var(--card)",
              color: "var(--text)",
            }}
          >
            <KanbanSquare className="h-4 w-4" />
            View tracker
          </button>
        </motion.div>

        <motion.div
          {...fadeUp(0.32)}
          className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-6"
          style={{ borderColor: "var(--border)" }}
        >
          {badges.map((b) => {
            const Icon = b.icon;
            return (
              <div
                key={b.label}
                className="flex items-center gap-2 text-[12.5px] font-medium text-[var(--muted)]"
              >
                <Icon
                  className="h-3.5 w-3.5"
                  style={{ color: "var(--text)" }}
                  strokeWidth={2}
                />
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
   STATS CARDS — premium, animated
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
            className="group rounded-2xl border p-5 shadow-[0_1px_2px_var(--shadow-sm)] transition-shadow duration-200 hover:shadow-[0_16px_36px_var(--shadow-md)]"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <IconBadge icon={Icon} tone={c.tone} />
            <p className="mt-4 text-[27px] font-semibold leading-none tracking-tight text-[var(--text)]">
              {typeof c.value === "number" ? (
                <AnimatedNumber value={c.value} />
              ) : (
                c.value
              )}
            </p>
            <p className="mt-2 text-[12.5px] font-medium text-[var(--muted-2)]">
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
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center"
      style={{ borderColor: "var(--border-strong)", background: "var(--subtle)" }}
    >
      <div
        className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border shadow-sm"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <div
          className="absolute inset-0 rounded-2xl"
          style={{ background: "var(--glow)" }}
        />
        <Icon
          className="relative h-6 w-6"
          style={{ color: "var(--muted-2)" }}
          strokeWidth={1.5}
        />
      </div>
      <p className="text-[14.5px] font-semibold text-[var(--text)]">{title}</p>
      <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-[var(--muted-2)]">
        {subtitle}
      </p>
      {cta && (
        <button
          onClick={cta.onClick}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-medium transition-all active:scale-[0.98]"
          style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
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
      className="group relative rounded-xl border p-4 shadow-[0_1px_2px_var(--shadow-sm)] transition-shadow duration-200 hover:shadow-[0_14px_30px_var(--shadow-md)]"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <div
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--subtle-2)", color: "var(--muted)" }}
          >
            <Building2 className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold text-[var(--text)]">
              {app.company}
            </p>
            <p className="truncate text-[12px] text-[var(--muted-2)]">
              {app.role}
            </p>
          </div>
        </div>
        <button
          onClick={() => deleteApp(app.id)}
          aria-label={`Remove ${app.company} application`}
          className="shrink-0 rounded-md p-1 opacity-0 transition-all group-hover:opacity-100"
          style={{ color: "var(--border-strong)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--danger-bg)";
            e.currentTarget.style.color = "var(--danger)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--border-strong)";
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3.5 flex items-center justify-between">
        <span className="text-[11px] text-[var(--muted-2)]">{date}</span>
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-transform active:scale-95"
            style={pillStyle(STATUS_META[app.status].color)}
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
                className="absolute right-0 z-20 mt-1.5 w-36 overflow-hidden rounded-lg border py-1 shadow-lg"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      updateStatus(app.id, s);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[var(--text-2)] hover:bg-[var(--subtle)]"
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: STATUS_META[s].color }}
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

      <div
        className="rounded-2xl border p-5 shadow-[0_1px_2px_var(--shadow-sm)] sm:p-6"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <h2 className="mb-4 text-[14px] font-semibold text-[var(--text)]">
          Add application
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="flex-1 rounded-lg border px-3.5 py-2.5 text-[13.5px] outline-none transition-colors"
            style={{
              borderColor: "var(--border-strong)",
              background: "var(--subtle)",
              color: "var(--text)",
            }}
            placeholder="Company name"
            value={tracker.company}
            onChange={(e) => tracker.setCompany(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tracker.addApplication()}
          />
          <input
            className="flex-1 rounded-lg border px-3.5 py-2.5 text-[13.5px] outline-none transition-colors"
            style={{
              borderColor: "var(--border-strong)",
              background: "var(--subtle)",
              color: "var(--text)",
            }}
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
            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2.5 text-[13.5px] font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
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
              className="h-40 rounded-2xl border p-4"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
            >
              <div
                className="h-full w-full animate-shimmer rounded-lg bg-[length:200%_100%]"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, var(--subtle-2) 25%, var(--border) 50%, var(--subtle-2) 75%)",
                }}
              />
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
                      style={{ background: meta.color }}
                    />
                    <span className="text-[12.5px] font-semibold text-[var(--text)]">
                      {meta.label}
                    </span>
                  </div>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10.5px] font-medium"
                    style={{ background: "var(--subtle-2)", color: "var(--muted-2)" }}
                  >
                    {apps.length}
                  </span>
                </div>
                <div
                  className="flex min-h-[100px] flex-col gap-2.5 rounded-2xl p-2"
                  style={{ background: "var(--subtle)" }}
                >
                  <AnimatePresence mode="popLayout">
                    {apps.length === 0 ? (
                      <div
                        className="flex h-20 items-center justify-center rounded-xl border border-dashed text-[11px]"
                        style={{
                          borderColor: "var(--border-strong)",
                          color: "var(--muted-2)",
                        }}
                      >
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
      <div
        className="flex items-center gap-3 rounded-2xl border p-4"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        {steps.map((s, i) => (
          <div key={s.n} className="flex flex-1 items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors"
                style={{
                  background: s.done ? "var(--btn-bg)" : "var(--subtle-2)",
                  color: s.done ? "var(--btn-text)" : "var(--muted-2)",
                }}
              >
                {s.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.n}
              </div>
              <span
                className="hidden text-[12px] font-medium sm:inline"
                style={{ color: s.done ? "var(--text)" : "var(--muted-2)" }}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="h-px flex-1"
                style={{
                  background: s.done ? "var(--accent-border)" : "var(--border)",
                }}
              />
            )}
          </div>
        ))}
      </div>

      <div
        className="rounded-2xl border p-5 shadow-[0_1px_2px_var(--shadow-sm)] sm:p-6"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <h2 className="mb-1 text-[14px] font-semibold text-[var(--text)]">
          1 — Upload resume
        </h2>
        <p className="mb-4 text-[12.5px] text-[var(--muted-2)]">
          Text-based PDFs only. No scanned images.
        </p>

        <div
          onClick={() => studio.fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            studio.selectFile(e.dataTransfer.files[0] ?? null);
          }}
          className="flex min-h-[130px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200"
          style={{
            borderColor: studio.resumeFile ? "var(--accent-border)" : "var(--border-strong)",
            background: studio.resumeFile ? "var(--accent-bg)" : "var(--subtle)",
          }}
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
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-sm"
                style={{ background: "var(--card)", color: "var(--accent)" }}
              >
                <FileText className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 text-left">
                <p className="truncate text-[13px] font-medium text-[var(--text)]">
                  {studio.resumeFile.name}
                </p>
                <p className="text-[11.5px] text-[var(--muted-2)]">
                  {(studio.resumeFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <span className="ml-auto shrink-0 text-[11px] text-[var(--muted-2)]">
                Click to change
              </span>
            </div>
          ) : (
            <>
              <div
                className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: "var(--subtle-2)", color: "var(--muted)" }}
              >
                <UploadCloud className="h-4.5 w-4.5" />
              </div>
              <p className="text-[13px] font-medium text-[var(--text-2)]">
                Drop your resume here, or click to browse
              </p>
              <p className="mt-1 text-[11.5px] text-[var(--muted-2)]">PDF only</p>
            </>
          )}
        </div>

        <button
          onClick={studio.uploadPDF}
          disabled={!studio.resumeFile || studio.phase === "uploading"}
          className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13.5px] font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
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
              className="mt-3.5 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[12.5px]"
              style={{
                borderColor: "var(--success-border)",
                background: "var(--success-bg)",
                color: "var(--success-text)",
              }}
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
          <pre
            className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border p-3.5 text-[11.5px] leading-relaxed"
            style={{
              borderColor: "var(--border)",
              background: "var(--subtle)",
              color: "var(--muted)",
            }}
          >
            {studio.resumeText.slice(0, 1500)}
            {studio.resumeText.length > 1500 ? "\n\n… (truncated)" : ""}
          </pre>
        )}

        {studio.error && studio.phase === "idle" && (
          <div
            className="mt-3.5 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[12.5px]"
            style={{
              borderColor: "var(--danger-border)",
              background: "var(--danger-bg)",
              color: "var(--danger)",
            }}
          >
            <XCircle className="h-4 w-4 shrink-0" />
            {studio.error}
          </div>
        )}
      </div>

      <div
        className="relative rounded-2xl border p-5 shadow-[0_1px_2px_var(--shadow-sm)] sm:p-6"
        style={{
          borderColor: "var(--border)",
          background: "var(--card)",
          opacity: studio.phase === "idle" ? 0.5 : 1,
        }}
      >
        {studio.phase === "idle" && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl text-[12.5px] font-medium backdrop-blur-[1px]"
            style={{ background: "var(--card)", opacity: 0.6, color: "var(--muted-2)" }}
          >
            Extract your resume first
          </div>
        )}
        <h2 className="mb-3 text-[14px] font-semibold text-[var(--text)]">
          2 — Paste job description
        </h2>
        <textarea
          className="w-full resize-y rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed outline-none transition-colors disabled:cursor-not-allowed"
          style={{
            borderColor: "var(--border-strong)",
            background: "var(--subtle)",
            color: "var(--text)",
          }}
          placeholder="Paste the full job description here. More detail = better analysis."
          value={studio.jobDesc}
          onChange={(e) => studio.setJobDesc(e.target.value)}
          disabled={studio.phase === "idle" || studio.phase === "uploading"}
          rows={7}
        />
        <p className="mt-1.5 text-right text-[11px] text-[var(--muted-2)]">
          {studio.wordCount(studio.jobDesc).toLocaleString()} words
        </p>
      </div>

      <div
        className="relative rounded-2xl border p-5 shadow-[0_1px_2px_var(--shadow-sm)] sm:p-6"
        style={{
          borderColor: "var(--border)",
          background: "var(--card)",
          opacity: studio.phase === "idle" || !studio.jobDesc.trim() ? 0.5 : 1,
        }}
      >
        {(studio.phase === "idle" || !studio.jobDesc.trim()) && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl text-[12.5px] font-medium backdrop-blur-[1px]"
            style={{ background: "var(--card)", opacity: 0.6, color: "var(--muted-2)" }}
          >
            Complete steps 1 &amp; 2 first
          </div>
        )}
        <h2 className="mb-3 text-[14px] font-semibold text-[var(--text)]">
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
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-[13.5px] font-medium shadow-sm transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--accent)", color: "#FFFFFF" }}
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
          <div
            className="mt-3 h-1 w-full overflow-hidden rounded-full"
            style={{ background: "var(--subtle-2)" }}
          >
            <div
              className="h-full w-1/3 animate-progress rounded-full"
              style={{ background: "var(--accent)" }}
            />
          </div>
        )}
        {studio.error &&
          (studio.phase === "extracted" || studio.phase === "done") && (
            <div
              className="mt-3.5 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[12.5px]"
              style={{
                borderColor: "var(--danger-border)",
                background: "var(--danger-bg)",
                color: "var(--danger)",
              }}
            >
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
      <div
        className="sticky top-24 flex h-full min-h-[420px] flex-col justify-center rounded-2xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <EmptyState
          icon={FileText}
          title="Your analysis will appear here"
          subtitle="Upload a resume and paste a job description to get an ATS score, section feedback, and quick wins."
        />
      </div>
    );
  }

  const statusColor = (status: SectionFeedback["status"]) => {
    if (status === "Good") return "#16A34A";
    if (status === "Needs Work") return "#D97706";
    return "#DC2626";
  };

  return (
    <div className="flex flex-col gap-5">
      <motion.div
        {...fadeUp(0)}
        className="rounded-2xl border p-6 text-center shadow-[0_1px_2px_var(--shadow-sm)]"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-medium"
          style={{
            borderColor: "var(--accent-border)",
            background: "var(--accent-bg)",
            color: "var(--accent)",
          }}
        >
          <KeyRound className="h-3 w-3" /> ATS Match Score
        </span>
        <div className="mt-4 text-[56px] font-semibold leading-none tracking-tight text-[var(--text)]">
          {analysis.overallScore}
          <span className="text-[22px] font-medium text-[var(--muted-2)]">
            /100
          </span>
        </div>
        <div
          className="mx-auto mt-4 h-1.5 w-full max-w-xs overflow-hidden rounded-full"
          style={{ background: "var(--subtle-2)" }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${analysis.overallScore}%` }}
            transition={{ duration: 0.8, ease: EASE }}
            className="h-full rounded-full"
            style={{ background: "var(--btn-bg)" }}
          />
        </div>
        <p className="mx-auto mt-4 max-w-md text-[13px] leading-relaxed text-[var(--muted)]">
          {analysis.summary}
        </p>
        <button
          className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-all active:scale-[0.98]"
          style={{ background: "var(--btn-bg)", color: "var(--btn-text)" }}
        >
          <Download className="h-4 w-4" /> Download ATS-ready PDF
        </button>
      </motion.div>

      <div
        className="max-h-[560px] overflow-y-auto rounded-2xl border p-5 shadow-[0_1px_2px_var(--shadow-sm)] sm:p-6"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <h2 className="mb-4 text-[14px] font-semibold text-[var(--text)]">
          Section-by-section feedback
        </h2>
        <div className="flex flex-col gap-3">
          {analysis.sections.map((sec, idx) => {
            const color = statusColor(sec.status);
            return (
              <motion.div
                key={sec.name}
                {...fadeUp(idx * 0.05)}
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--border)", background: "var(--subtle)" }}
              >
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-[var(--text)]">
                    {sec.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                      style={pillStyle(color)}
                    >
                      {sec.status}
                    </span>
                    <span className="text-[12.5px] font-semibold text-[var(--text)]">
                      {sec.score}/100
                    </span>
                  </div>
                </div>
                <div
                  className="mb-3 h-1 w-full overflow-hidden rounded-full"
                  style={{ background: "var(--border)" }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${sec.score}%` }}
                    transition={{ duration: 0.7, delay: 0.1 }}
                    className="h-full rounded-full"
                    style={{ background: color }}
                  />
                </div>
                <p className="mb-2.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
                  {sec.feedback}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {sec.suggestions.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[12px] text-[var(--text-2)]"
                    >
                      <ArrowRight
                        className="mt-0.5 h-3 w-3 shrink-0"
                        style={{ color: "var(--accent)" }}
                      />
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
        <div
          className="rounded-2xl border p-5 shadow-[0_1px_2px_var(--shadow-sm)]"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <h2 className="mb-3 text-[13.5px] font-semibold text-[var(--text)]">
            Missing keywords
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {analysis.missingKeywords.map((kw) => (
              <span
                key={kw}
                className="rounded-full border px-2.5 py-1 text-[11.5px] font-medium"
                style={{
                  borderColor: "var(--danger-border)",
                  background: "var(--danger-bg)",
                  color: "var(--danger)",
                }}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
        <div
          className="rounded-2xl border p-5 shadow-[0_1px_2px_var(--shadow-sm)]"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <h2 className="mb-3 text-[13.5px] font-semibold text-[var(--text)]">
            Quick wins
          </h2>
          <ul className="flex flex-col gap-2">
            {analysis.quickWins.map((win, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[12px] leading-relaxed text-[var(--text-2)]"
              >
                <CheckCircle2
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  style={{ color: "var(--success)" }}
                />
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
    <footer className="mt-16 border-t py-8" style={{ borderColor: "var(--border)" }}>
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-[12.5px] text-[var(--muted-2)] sm:flex-row">
        <span>© {new Date().getFullYear()} ApplyOS. Your career companion.</span>
        <span className="flex items-center gap-1.5">
          Built with{" "}
          <Sparkles className="h-3 w-3" style={{ color: "var(--accent)" }} /> and
          intent.
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
  const { theme, toggleTheme } = useTheme();

  return (
    <div data-theme={theme} className="min-h-screen transition-colors duration-300" style={{ background: "var(--bg)" }}>
      <style>{`
        [data-theme="light"] {
          --bg: #FAFAFA;
          --nav-bg: rgba(255,255,255,0.7);
          --card: #FFFFFF;
          --border: #EDEDED;
          --border-strong: #E4E4E7;
          --text: #111111;
          --text-2: #3F3F46;
          --muted: #71717A;
          --muted-2: #A1A1AA;
          --subtle: #FAFAFA;
          --subtle-2: #F4F4F5;
          --accent: #2563EB;
          --accent-bg: #EFF4FF;
          --accent-border: #DCE7FE;
          --btn-bg: #111111;
          --btn-text: #FFFFFF;
          --danger: #DC2626;
          --danger-bg: #FDF2F2;
          --danger-border: #F5D5D5;
          --success: #16A34A;
          --success-text: #065F46;
          --success-bg: #F2FAF6;
          --success-border: #DDEFE5;
          --glow: rgba(37,99,235,0.08);
          --shadow-sm: rgba(0,0,0,0.03);
          --shadow-md: rgba(0,0,0,0.06);
          --shadow-lg: rgba(0,0,0,0.09);
        }
        [data-theme="dark"] {
          --bg: #0A0A0B;
          --nav-bg: rgba(10,10,11,0.7);
          --card: #131316;
          --border: #232326;
          --border-strong: #2A2A2E;
          --text: #F4F4F5;
          --text-2: #D4D4D8;
          --muted: #A1A1AA;
          --muted-2: #71717A;
          --subtle: #18181B;
          --subtle-2: #1D1D20;
          --accent: #3B82F6;
          --accent-bg: rgba(59,130,246,0.12);
          --accent-border: rgba(59,130,246,0.3);
          --btn-bg: #F4F4F5;
          --btn-text: #111111;
          --danger: #F87171;
          --danger-bg: rgba(248,113,113,0.1);
          --danger-border: rgba(248,113,113,0.28);
          --success: #4ADE80;
          --success-text: #86EFAC;
          --success-bg: rgba(74,222,128,0.1);
          --success-border: rgba(74,222,128,0.28);
          --glow: rgba(59,130,246,0.16);
          --shadow-sm: rgba(0,0,0,0.25);
          --shadow-md: rgba(0,0,0,0.4);
          --shadow-lg: rgba(0,0,0,0.55);
        }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .animate-shimmer { animation: shimmer 1.4s infinite; }
        @keyframes progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        .animate-progress { animation: progress 1.2s ease-in-out infinite; }
      `}</style>

      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      {activeTab === "dashboard" && (
        <Hero setActiveTab={setActiveTab} stats={tracker.stats} />
      )}

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-6">
        {activeTab === "dashboard" && (
          <div className="flex flex-col gap-10">
            <div>
              <h2 className="mb-5 text-[13px] font-semibold uppercase tracking-wide text-[var(--muted-2)]">
                Your pipeline
              </h2>
              <StatsCards stats={tracker.stats} />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <motion.div
                {...fadeUp(0)}
                whileHover={{ y: -3 }}
                className="group rounded-2xl border p-6 shadow-[0_1px_2px_var(--shadow-sm)] transition-shadow hover:shadow-[0_20px_40px_var(--shadow-md)]"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                <IconBadge icon={KanbanSquare} tone="blue" />
                <h3 className="mb-1.5 mt-4 text-[15.5px] font-semibold text-[var(--text)]">
                  Job Tracker
                </h3>
                <p className="mb-5 text-[13px] leading-relaxed text-[var(--muted)]">
                  Manage every application on a Kanban board — from applied to
                  offer.
                </p>
                <button
                  onClick={() => setActiveTab("tracker")}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text)]"
                >
                  Open tracker
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </motion.div>

              <motion.div
                {...fadeUp(0.08)}
                whileHover={{ y: -3 }}
                className="group rounded-2xl border p-6 shadow-[0_1px_2px_var(--shadow-sm)] transition-shadow hover:shadow-[0_20px_40px_var(--shadow-md)]"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                <IconBadge icon={Sparkles} tone="dark" />
                <h3 className="mb-1.5 mt-4 text-[15.5px] font-semibold text-[var(--text)]">
                  AI Resume Studio
                </h3>
                <p className="mb-5 text-[13px] leading-relaxed text-[var(--muted)]">
                  Get an ATS score, section feedback, and keyword gaps in
                  seconds.
                </p>
                <button
                  onClick={() => setActiveTab("studio")}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text)]"
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
              <h1 className="text-[28px] font-semibold tracking-tight text-[var(--text)]">
                Job Tracker
              </h1>
              <p className="mt-1 text-[13.5px] text-[var(--muted)]">
                Manage all your job applications in one place.
              </p>
            </motion.div>
            <TrackerBoard tracker={tracker} />
          </div>
        )}

        {activeTab === "studio" && (
          <div className="flex flex-col gap-6">
            <motion.div {...fadeUp(0)}>
              <h1 className="text-[28px] font-semibold tracking-tight text-[var(--text)]">
                AI Resume Studio
              </h1>
              <p className="mt-1 text-[13.5px] text-[var(--muted)]">
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