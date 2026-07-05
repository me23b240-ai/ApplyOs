"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Zap,
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
  Inbox,
  TrendingUp,
  Award,
  CalendarClock,
  SendHorizontal,
  Building2,
  KeyRound,
  Zap as Bolt,
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
   STATUS META — same keys, new premium palette
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
    bg: "#EFF4FF",
    border: "#DCE7FE",
    dot: "#2563EB",
  },
  oa: {
    label: "OA",
    color: "#7C3AED",
    bg: "#F5F0FE",
    border: "#E4D8FC",
    dot: "#7C3AED",
  },
  interview: {
    label: "Interview",
    color: "#B45309",
    bg: "#FFF7EB",
    border: "#FCE8C6",
    dot: "#D97706",
  },
  rejected: {
    label: "Rejected",
    color: "#DC2626",
    bg: "#FEF2F2",
    border: "#FBDADA",
    dot: "#DC2626",
  },
  offer: {
    label: "Offer",
    color: "#16A34A",
    bg: "#F0FCF4",
    border: "#CFF3DB",
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
   PRESENTATIONAL COMPONENTS
   ============================================================ */

type Tab = "dashboard" | "tracker" | "studio";

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
    <header className="sticky top-0 z-40 border-b border-[#E5E7EB] bg-[#F8FAFC]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#111827] text-white">
            <Bolt className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-[#111827]">
            ApplyOS
          </span>
        </div>

        <nav className="hidden items-center gap-1 rounded-full border border-[#E5E7EB] bg-white p-1 shadow-sm sm:flex">
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                  active
                    ? "bg-[#111827] text-white shadow-sm"
                    : "text-[#6B7280] hover:bg-[#F8FAFC] hover:text-[#111827]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111827] text-[12px] font-semibold text-white">
          A
        </div>
      </div>

      {/* mobile tabs */}
      <div className="flex gap-1 overflow-x-auto border-t border-[#E5E7EB] px-4 py-2 sm:hidden">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                active
                  ? "bg-[#111827] text-white"
                  : "bg-white text-[#6B7280] border border-[#E5E7EB]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}

function Hero({ setActiveTab }: { setActiveTab: (t: Tab) => void }) {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-4 pt-16 sm:pt-20">
      <div className="animate-fade-up max-w-2xl">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3 py-1 text-[12px] font-medium text-[#6B7280] shadow-sm">
          <Sparkles className="h-3 w-3 text-[#2563EB]" />
          AI-powered career workspace
        </span>
        <h1 className="mt-5 text-[36px] font-semibold leading-[1.1] tracking-tight text-[#111827] sm:text-[46px]">
          Land your next role,
          <br />
          <span className="text-[#6B7280]">systematically.</span>
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#6B7280]">
          Track every application in one board, and let AI tell you exactly
          what to fix before you hit submit.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button
            onClick={() => setActiveTab("tracker")}
            className="group inline-flex items-center gap-2 rounded-lg bg-[#111827] px-4 py-2.5 text-[13.5px] font-medium text-white shadow-sm transition-all hover:bg-[#1F2937] active:scale-[0.98]"
          >
            <KanbanSquare className="h-4 w-4" />
            Open Tracker
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            onClick={() => setActiveTab("studio")}
            className="group inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2.5 text-[13.5px] font-medium text-[#111827] shadow-sm transition-all hover:border-[#2563EB]/30 hover:bg-[#EFF4FF] active:scale-[0.98]"
          >
            <Sparkles className="h-4 w-4 text-[#2563EB]" />
            Analyze Resume
          </button>
        </div>
      </div>
    </section>
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
      accent: "#2563EB",
    },
    {
      label: "Interviews",
      value: stats.interviews,
      icon: CalendarClock,
      accent: "#D97706",
    },
    { label: "Offers", value: stats.offers, icon: Award, accent: "#16A34A" },
    {
      label: "Response rate",
      value: `${stats.rate}%`,
      icon: TrendingUp,
      accent: "#7C3AED",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            style={{ animationDelay: `${i * 60}ms` }}
            className="animate-fade-up group rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(17,24,39,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(17,24,39,0.08)]"
          >
            <div
              className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ background: `${c.accent}14`, color: c.accent }}
            >
              <Icon className="h-4 w-4" strokeWidth={2.25} />
            </div>
            <p className="text-[26px] font-semibold leading-none tracking-tight text-[#111827]">
              {c.value}
            </p>
            <p className="mt-2 text-[12.5px] font-medium text-[#6B7280]">
              {c.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Inbox;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E5E7EB] bg-white/60 px-6 py-14 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#F8FAFC] text-[#9CA3AF]">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <p className="text-[14px] font-medium text-[#111827]">{title}</p>
      <p className="mt-1 max-w-xs text-[12.5px] text-[#6B7280]">{subtitle}</p>
    </div>
  );
}

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
    <div className="group relative rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D1D5DB] hover:shadow-[0_10px_24px_rgba(17,24,39,0.08)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F8FAFC] text-[#6B7280]">
            <Building2 className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold text-[#111827]">
              {app.company}
            </p>
            <p className="truncate text-[12px] text-[#6B7280]">{app.role}</p>
          </div>
        </div>
        <button
          onClick={() => deleteApp(app.id)}
          className="shrink-0 rounded-md p-1 text-[#D1D5DB] opacity-0 transition-all hover:bg-[#FEF2F2] hover:text-[#DC2626] group-hover:opacity-100"
          title="Remove"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3.5 flex items-center justify-between">
        <span className="text-[11px] text-[#9CA3AF]">{date}</span>
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
          {open && (
            <div className="absolute right-0 z-20 mt-1.5 w-36 overflow-hidden rounded-lg border border-[#E5E7EB] bg-white py-1 shadow-lg animate-fade-up">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    updateStatus(app.id, s);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#374151] hover:bg-[#F8FAFC]"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: STATUS_META[s].dot }}
                  />
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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

      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(17,24,39,0.04)] sm:p-6">
        <h2 className="mb-4 text-[14px] font-semibold text-[#111827]">
          Add application
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="flex-1 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3.5 py-2.5 text-[13.5px] text-[#111827] outline-none transition-colors placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10"
            placeholder="Company name"
            value={tracker.company}
            onChange={(e) => tracker.setCompany(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tracker.addApplication()}
          />
          <input
            className="flex-1 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3.5 py-2.5 text-[13.5px] text-[#111827] outline-none transition-colors placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10"
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
            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#111827] px-4 py-2.5 text-[13.5px] font-medium text-white transition-all hover:bg-[#1F2937] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
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
              className="h-40 rounded-2xl border border-[#E5E7EB] bg-white p-4"
            >
              <div className="h-full w-full animate-shimmer rounded-lg bg-gradient-to-r from-[#F3F4F6] via-[#E5E7EB] to-[#F3F4F6] bg-[length:200%_100%]" />
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
              <div key={status} className="flex flex-col gap-3 min-w-0">
                <div className="flex items-center justify-between px-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: meta.dot }}
                    />
                    <span className="text-[12.5px] font-semibold text-[#111827]">
                      {meta.label}
                    </span>
                  </div>
                  <span className="rounded-full bg-[#F1F5F9] px-1.5 py-0.5 text-[10.5px] font-medium text-[#6B7280]">
                    {apps.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2.5 rounded-2xl bg-[#F1F5F9]/60 p-2 min-h-[100px]">
                  {apps.length === 0 ? (
                    <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-[#E2E8F0] text-[11px] text-[#9CA3AF]">
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
      <div className="flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4">
        {steps.map((s, i) => (
          <div key={s.n} className="flex flex-1 items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                  s.done
                    ? "bg-[#111827] text-white"
                    : "bg-[#F1F5F9] text-[#9CA3AF]"
                }`}
              >
                {s.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.n}
              </div>
              <span
                className={`hidden text-[12px] font-medium sm:inline ${
                  s.done ? "text-[#111827]" : "text-[#9CA3AF]"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-px flex-1 ${
                  s.done ? "bg-[#111827]/30" : "bg-[#E5E7EB]"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(17,24,39,0.04)] sm:p-6">
        <h2 className="mb-1 text-[14px] font-semibold text-[#111827]">
          1 — Upload resume
        </h2>
        <p className="mb-4 text-[12.5px] text-[#6B7280]">
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
              ? "border-[#2563EB]/30 bg-[#EFF4FF]"
              : "border-[#E5E7EB] hover:border-[#2563EB]/40 hover:bg-[#F8FAFC]"
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
                <p className="truncate text-[13px] font-medium text-[#111827]">
                  {studio.resumeFile.name}
                </p>
                <p className="text-[11.5px] text-[#6B7280]">
                  {(studio.resumeFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <span className="ml-auto shrink-0 text-[11px] text-[#9CA3AF]">
                Click to change
              </span>
            </div>
          ) : (
            <>
              <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F5F9] text-[#6B7280]">
                <UploadCloud className="h-4.5 w-4.5" />
              </div>
              <p className="text-[13px] font-medium text-[#374151]">
                Drop your resume here, or click to browse
              </p>
              <p className="mt-1 text-[11.5px] text-[#9CA3AF]">PDF only</p>
            </>
          )}
        </div>

        <button
          onClick={studio.uploadPDF}
          disabled={!studio.resumeFile || studio.phase === "uploading"}
          className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#111827] px-4 py-2.5 text-[13.5px] font-medium text-white transition-all hover:bg-[#1F2937] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
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

        {(studio.phase === "extracted" ||
          studio.phase === "generating" ||
          studio.phase === "done") && (
          <div className="mt-3.5 flex items-center gap-2 rounded-lg border border-[#CFF3DB] bg-[#F0FCF4] px-3.5 py-2.5 text-[12.5px] text-[#16A34A]">
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
          </div>
        )}

        {studio.showPreview && studio.resumeText && (
          <pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3.5 text-[11.5px] leading-relaxed text-[#6B7280]">
            {studio.resumeText.slice(0, 1500)}
            {studio.resumeText.length > 1500 ? "\n\n… (truncated)" : ""}
          </pre>
        )}

        {studio.error && studio.phase === "idle" && (
          <div className="mt-3.5 flex items-center gap-2 rounded-lg border border-[#FBDADA] bg-[#FEF2F2] px-3.5 py-2.5 text-[12.5px] text-[#DC2626]">
            <XCircle className="h-4 w-4 shrink-0" />
            {studio.error}
          </div>
        )}
      </div>

      <div
        className={`relative rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(17,24,39,0.04)] sm:p-6 ${
          studio.phase === "idle" ? "opacity-50" : ""
        }`}
      >
        {studio.phase === "idle" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/50 text-[12.5px] font-medium text-[#9CA3AF] backdrop-blur-[1px]">
            Extract your resume first
          </div>
        )}
        <h2 className="mb-3 text-[14px] font-semibold text-[#111827]">
          2 — Paste job description
        </h2>
        <textarea
          className="w-full resize-y rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3.5 py-3 text-[13px] leading-relaxed text-[#111827] outline-none transition-colors placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10 disabled:cursor-not-allowed"
          placeholder="Paste the full job description here. More detail = better analysis."
          value={studio.jobDesc}
          onChange={(e) => studio.setJobDesc(e.target.value)}
          disabled={studio.phase === "idle" || studio.phase === "uploading"}
          rows={7}
        />
        <p className="mt-1.5 text-right text-[11px] text-[#9CA3AF]">
          {studio.wordCount(studio.jobDesc).toLocaleString()} words
        </p>
      </div>

      <div
        className={`relative rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(17,24,39,0.04)] sm:p-6 ${
          studio.phase === "idle" || !studio.jobDesc.trim() ? "opacity-50" : ""
        }`}
      >
        {(studio.phase === "idle" || !studio.jobDesc.trim()) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/50 text-[12.5px] font-medium text-[#9CA3AF] backdrop-blur-[1px]">
            Complete steps 1 &amp; 2 first
          </div>
        )}
        <h2 className="mb-3 text-[14px] font-semibold text-[#111827]">
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
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
            <div className="h-full w-1/3 animate-progress rounded-full bg-[#2563EB]" />
          </div>
        )}
        {studio.error &&
          (studio.phase === "extracted" || studio.phase === "done") && (
            <div className="mt-3.5 flex items-center gap-2 rounded-lg border border-[#FBDADA] bg-[#FEF2F2] px-3.5 py-2.5 text-[12.5px] text-[#DC2626]">
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
      <div className="sticky top-24 flex h-full min-h-[420px] flex-col rounded-2xl border border-[#E5E7EB] bg-white p-6">
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
      return { color: "#16A34A", bg: "#F0FCF4", border: "#CFF3DB" };
    if (status === "Needs Work")
      return { color: "#B45309", bg: "#FFF7EB", border: "#FCE8C6" };
    return { color: "#DC2626", bg: "#FEF2F2", border: "#FBDADA" };
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 text-center shadow-[0_1px_2px_rgba(17,24,39,0.04)] animate-fade-up">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#DCE7FE] bg-[#EFF4FF] px-3 py-1 text-[11.5px] font-medium text-[#2563EB]">
          <KeyRound className="h-3 w-3" /> ATS Match Score
        </span>
        <div className="mt-4 text-[56px] font-semibold leading-none tracking-tight text-[#111827]">
          {analysis.overallScore}
          <span className="text-[22px] font-medium text-[#9CA3AF]">/100</span>
        </div>
        <div className="mx-auto mt-4 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[#F1F5F9]">
          <div
            className="h-full rounded-full bg-[#2563EB] transition-all duration-700"
            style={{ width: `${analysis.overallScore}%` }}
          />
        </div>
        <p className="mx-auto mt-4 max-w-md text-[13px] leading-relaxed text-[#6B7280]">
          {analysis.summary}
        </p>
        <button className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#111827] px-4 py-2.5 text-[13px] font-medium text-white transition-all hover:bg-[#1F2937] active:scale-[0.98]">
          <Download className="h-4 w-4" /> Download ATS-ready PDF
        </button>
      </div>

      <div className="max-h-[560px] overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(17,24,39,0.04)] sm:p-6">
        <h2 className="mb-4 text-[14px] font-semibold text-[#111827]">
          Section-by-section feedback
        </h2>
        <div className="flex flex-col gap-3">
          {analysis.sections.map((sec) => {
            const st = statusStyle(sec.status);
            return (
              <div
                key={sec.name}
                className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/60 p-4"
              >
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-[#111827]">
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
                    <span className="text-[12.5px] font-semibold text-[#111827]">
                      {sec.score}/100
                    </span>
                  </div>
                </div>
                <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${sec.score}%`, background: st.color }}
                  />
                </div>
                <p className="mb-2.5 text-[12.5px] leading-relaxed text-[#6B7280]">
                  {sec.feedback}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {sec.suggestions.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[12px] text-[#374151]"
                    >
                      <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-[#2563EB]" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <h2 className="mb-3 text-[13.5px] font-semibold text-[#111827]">
            Missing keywords
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {analysis.missingKeywords.map((kw) => (
              <span
                key={kw}
                className="rounded-full border border-[#FBDADA] bg-[#FEF2F2] px-2.5 py-1 text-[11.5px] font-medium text-[#DC2626]"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <h2 className="mb-3 text-[13.5px] font-semibold text-[#111827]">
            Quick wins
          </h2>
          <ul className="flex flex-col gap-2">
            {analysis.quickWins.map((win, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[12px] leading-relaxed text-[#374151]"
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
    <footer className="mt-16 border-t border-[#E5E7EB] py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 text-[12.5px] text-[#9CA3AF] sm:flex-row">
        <span>© {new Date().getFullYear()} ApplyOS. Your career companion.</span>
        <span className="flex items-center gap-1.5">
          Built with <Zap className="h-3 w-3 text-[#2563EB]" /> and intent.
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
    <div className="min-h-screen bg-[#F8FAFC] antialiased">
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-up { animation: fadeUp 0.45s ease both; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .animate-shimmer { animation: shimmer 1.4s infinite; }
        @keyframes progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        .animate-progress { animation: progress 1.2s ease-in-out infinite; }
      `}</style>

      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {activeTab === "dashboard" && <Hero setActiveTab={setActiveTab} />}

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-6">
        {activeTab === "dashboard" && (
          <div className="flex flex-col gap-8">
            <StatsCards stats={tracker.stats} />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="group rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(17,24,39,0.04)] transition-all hover:shadow-[0_8px_24px_rgba(17,24,39,0.08)]">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#EFF4FF] text-[#2563EB]">
                  <KanbanSquare className="h-4.5 w-4.5" />
                </div>
                <h3 className="mb-1.5 text-[15px] font-semibold text-[#111827]">
                  Job Tracker
                </h3>
                <p className="mb-5 text-[13px] leading-relaxed text-[#6B7280]">
                  Manage every application on a Kanban board — from applied to
                  offer.
                </p>
                <button
                  onClick={() => setActiveTab("tracker")}
                  className="group/btn inline-flex items-center gap-1.5 text-[13px] font-medium text-[#111827]"
                >
                  Open tracker
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5" />
                </button>
              </div>
              <div className="group rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_2px_rgba(17,24,39,0.04)] transition-all hover:shadow-[0_8px_24px_rgba(17,24,39,0.08)]">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#F5F0FE] text-[#7C3AED]">
                  <Sparkles className="h-4.5 w-4.5" />
                </div>
                <h3 className="mb-1.5 text-[15px] font-semibold text-[#111827]">
                  AI Resume Studio
                </h3>
                <p className="mb-5 text-[13px] leading-relaxed text-[#6B7280]">
                  Get an ATS score, section feedback, and keyword gaps in
                  seconds.
                </p>
                <button
                  onClick={() => setActiveTab("studio")}
                  className="group/btn inline-flex items-center gap-1.5 text-[13px] font-medium text-[#111827]"
                >
                  Open studio
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "tracker" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-[26px] font-semibold tracking-tight text-[#111827]">
                Job Tracker
              </h1>
              <p className="mt-1 text-[13.5px] text-[#6B7280]">
                Manage all your job applications in one place.
              </p>
            </div>
            <TrackerBoard tracker={tracker} />
          </div>
        )}

        {activeTab === "studio" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-[26px] font-semibold tracking-tight text-[#111827]">
                AI Resume Studio
              </h1>
              <p className="mt-1 text-[13.5px] text-[#6B7280]">
                Upload your resume and match it against any job description.
              </p>
            </div>
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