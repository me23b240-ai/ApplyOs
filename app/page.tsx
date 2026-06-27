"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

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

const STATUS_META: Record<Status, { label: string; color: string; bg: string }> = {
  applied:   { label: "Applied",   color: "#93c5fd", bg: "rgba(147,197,253,0.12)" },
  oa:        { label: "OA",        color: "#c4b5fd", bg: "rgba(196,181,253,0.12)" },
  interview: { label: "Interview", color: "#6ee7b7", bg: "rgba(110,231,183,0.12)" },
  rejected:  { label: "Rejected",  color: "#fca5a5", bg: "rgba(252,165,165,0.12)" },
  offer:     { label: "Offer 🎉",  color: "#fde68a", bg: "rgba(253,230,138,0.12)" },
};

const STATUSES = Object.keys(STATUS_META) as Status[];

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

  useEffect(() => { fetchApps(); }, [fetchApps]);

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
    setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  };

  const deleteApp = async (id: string) => {
    await supabase.from("applications").delete().eq("id", id);
    setApps(prev => prev.filter(a => a.id !== id));
  };

  const stats = {
    total: apps.length,
    interviews: apps.filter(a => a.status === "interview").length,
    offers: apps.filter(a => a.status === "offer").length,
    rate: apps.length
      ? Math.round((apps.filter(a => ["interview", "offer"].includes(a.status)).length / apps.length) * 100)
      : 0,
  };

  return { apps, loading, company, role, submitting, stats, setCompany, setRole, addApplication, updateStatus, deleteApp };
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
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
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
        setError("Could not extract text. Make sure this is a text-based PDF, not a scanned image.");
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

  const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

  return {
    phase, resumeFile, resumeText, jobDesc, analysis, error, showPreview, fileInputRef,
    setJobDesc, setShowPreview, selectFile, uploadPDF, analyzeResume, wordCount,
  };
}

function Sidebar({
  activeTab, setActiveTab, stats,
}: {
  activeTab: "dashboard" | "tracker" | "studio";
  setActiveTab: (t: "dashboard" | "tracker" | "studio") => void;
  stats: { total: number; interviews: number; offers: number; rate: number };
}) {
  const navItems = [
    { id: "dashboard", icon: "⊞", label: "Dashboard" },
    { id: "tracker",   icon: "📅", label: "Job Tracker" },
    { id: "studio",    icon: "✦",  label: "AI Studio", badge: "NEW" },
  ] as const;

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-icon">⚡</span>
        <span className="sidebar-logo-text">ApplyOS</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`sidebar-item ${activeTab === item.id ? "sidebar-item-active" : ""}`}
            onClick={() => setActiveTab(item.id)}
          >
            <span className="sidebar-item-icon">{item.icon}</span>
            <span className="sidebar-item-label">{item.label}</span>
            {"badge" in item && item.badge && (
              <span className="sidebar-badge">{item.badge}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-stats">
        <p className="sidebar-stats-title">STATS OVERVIEW</p>
        {[
          { icon: "📤", label: "Total Applied",  value: stats.total,         color: "#93c5fd" },
          { icon: "📅", label: "Interviews",     value: stats.interviews,    color: "#6ee7b7" },
          { icon: "⭐", label: "Offers",         value: stats.offers,        color: "#fde68a" },
          { icon: "📈", label: "Response Rate",  value: `${stats.rate}%`,   color: "#a78bfa" },
        ].map(s => (
          <div className="sidebar-stat" key={s.label}>
            <div className="sidebar-stat-icon" style={{ background: `${s.color}18`, color: s.color }}>{s.icon}</div>
            <div>
              <p className="sidebar-stat-value">{s.value}</p>
              <p className="sidebar-stat-label">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-avatar">A</div>
        <div>
          <p className="sidebar-footer-name">ApplyOS</p>
          <p className="sidebar-footer-sub">Your career companion</p>
        </div>
      </div>
    </aside>
  );
}

function DashboardTab({
  stats, setActiveTab,
}: {
  stats: { total: number; interviews: number; offers: number; rate: number };
  setActiveTab: (t: "dashboard" | "tracker" | "studio") => void;
}) {
  return (
    <div className="tab-content">
      <div className="dash-hero">
        <div>
          <h1 className="dash-title">AI-Powered Job Application Assistant</h1>
          <p className="dash-sub">Track your applications and use AI to optimize your resume for any job description.</p>
        </div>
      </div>

      <div className="dash-stats">
        {[
          { icon: "📤", label: "Total Applied",  sub: "Track all your applications",  value: stats.total,      color: "#93c5fd" },
          { icon: "📅", label: "Interviews",     sub: "Interview rounds",             value: stats.interviews, color: "#6ee7b7" },
          { icon: "⭐", label: "Offers",         sub: "Job offers received",          value: stats.offers,     color: "#fde68a" },
          { icon: "📈", label: "Response Rate",  sub: "Success rate",                 value: `${stats.rate}%`, color: "#a78bfa" },
        ].map(s => (
          <div className="dash-stat-card" key={s.label}>
            <div className="dash-stat-icon" style={{ background: `${s.color}18`, color: s.color }}>{s.icon}</div>
            <div className="dash-stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="dash-stat-label">{s.label}</div>
            <div className="dash-stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="dash-cta-grid">
        <div className="dash-cta-card">
          <div className="dash-cta-icon" style={{ background: "rgba(99,102,241,0.15)", color: "#a78bfa" }}>📅</div>
          <h3 className="dash-cta-title">Job Tracker</h3>
          <p className="dash-cta-desc">Add and manage all your job applications in one place. Track status from applied to offer.</p>
          <button className="btn btn-primary" onClick={() => setActiveTab("tracker")}>Open Tracker →</button>
        </div>
        <div className="dash-cta-card">
          <div className="dash-cta-icon" style={{ background: "rgba(6,182,212,0.15)", color: "#38bdf8" }}>✦</div>
          <h3 className="dash-cta-title">AI Resume Studio</h3>
          <p className="dash-cta-desc">Upload your resume and paste a job description. Get an ATS score and actionable feedback instantly.</p>
          <button className="btn btn-accent" onClick={() => setActiveTab("studio")}>Open AI Studio →</button>
        </div>
      </div>

      <div className="dash-features">
        {[
          { icon: "✦", color: "#a78bfa", label: "Smart Analysis",      sub: "AI-powered ATS score and feedback" },
          { icon: "📋", color: "#6ee7b7", label: "Resume Optimization", sub: "Tailored suggestions to stand out" },
          { icon: "🎯", color: "#fbbf24", label: "Job Match Score",     sub: "Know your fit before you apply" },
        ].map(f => (
          <div className="dash-feature-card" key={f.label}>
            <div style={{ fontSize: 20, color: f.color, marginBottom: 8 }}>{f.icon}</div>
            <p style={{ fontSize: 13, fontWeight: 600, color: f.color }}>{f.label}</p>
            <p style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{f.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "tracker" | "studio">("dashboard");
  const tracker = useTracker();
  const studio = useStudio();

  return (
    <>
      <style>{globalStyles}</style>
      <div className="layout">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} stats={tracker.stats} />
        <div className="content-area">
          <header className="topbar">
            <div style={{ flex: 1 }} />
            <button
              className={`topbar-tab ${activeTab === "tracker" ? "topbar-tab-active" : ""}`}
              onClick={() => setActiveTab("tracker")}
            >📅 Job Tracker</button>
            <button
              className={`topbar-tab topbar-tab-accent ${activeTab === "studio" ? "topbar-tab-active-accent" : ""}`}
              onClick={() => setActiveTab("studio")}
            >✦ AI Studio</button>
          </header>

          <main className="main">

            {activeTab === "dashboard" && (
              <DashboardTab stats={tracker.stats} setActiveTab={setActiveTab} />
            )}

            {activeTab === "tracker" && (
              <div className="tab-content">
                <div>
                  <h1 className="dash-title">Job Tracker</h1>
                  <p className="dash-sub">Manage all your job applications in one place.</p>
                </div>
                <div className="stats-row">
                  {[
                    { label: "Total Applied",  value: tracker.stats.total,      icon: "📤", color: "#93c5fd" },
                    { label: "Interviews",     value: tracker.stats.interviews, icon: "📅", color: "#6ee7b7" },
                    { label: "Offers",         value: tracker.stats.offers,     icon: "⭐", color: "#fde68a" },
                    { label: "Response Rate",  value: `${tracker.stats.rate}%`, icon: "📈", color: "#a78bfa" },
                  ].map(s => (
                    <div className="stat-card" key={s.label}>
                      <div className="stat-card-icon" style={{ background: `${s.color}18`, color: s.color }}>{s.icon}</div>
                      <span className="stat-value" style={{ color: s.color }}>{s.value}</span>
                      <span className="stat-label">{s.label}</span>
                    </div>
                  ))}
                </div>
                <div className="glass-card">
                  <h2 className="card-title">Add Application</h2>
                  <div className="add-form">
                    <input className="input" placeholder="Company name" value={tracker.company}
                      onChange={e => tracker.setCompany(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && tracker.addApplication()} />
                    <input className="input" placeholder="Role / Position" value={tracker.role}
                      onChange={e => tracker.setRole(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && tracker.addApplication()} />
                    <button className="btn btn-primary" onClick={tracker.addApplication}
                      disabled={tracker.submitting || !tracker.company.trim() || !tracker.role.trim()}>
                      {tracker.submitting ? <><span className="spinner" /> Adding…</> : "+ Add"}
                    </button>
                  </div>
                </div>
                <div className="glass-card">
                  <h2 className="card-title">Applications <span className="badge">{tracker.apps.length}</span></h2>
                  {tracker.loading ? (
                    <div className="skeleton-list">{[0, 1, 2].map(i => <div key={i} className="skeleton-row" />)}</div>
                  ) : tracker.apps.length === 0 ? (
                    <div className="empty">
                      <p className="empty-icon">📭</p>
                      <p className="empty-text">No applications yet. Add your first one above.</p>
                    </div>
                  ) : (
                    <div className="app-list">
                      {tracker.apps.map(app => {
                        const meta = STATUS_META[app.status] ?? STATUS_META.applied;
                        return (
                          <div className="app-row" key={app.id}>
                            <div className="app-info">
                              <span className="app-company">{app.company}</span>
                              <span className="app-role">{app.role}</span>
                            </div>
                            <div className="app-actions">
                              <span className="status-pill"
                                style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.color}30` }}>
                                {meta.label}
                              </span>
                              <select className="status-select" value={app.status}
                                onChange={e => tracker.updateStatus(app.id, e.target.value as Status)}>
                                {STATUSES.map(s => (
                                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                                ))}
                              </select>
                              <button className="btn-ghost-danger" onClick={() => tracker.deleteApp(app.id)} title="Remove">✕</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "studio" && (
              <div className="tab-content">
                <div className="studio-header-row">
                  <div>
                    <h1 className="dash-title">AI Resume Studio</h1>
                    <p className="dash-sub">Upload your resume and match it against any job description.</p>
                  </div>
                  <span className="step-badge">
                    Step {studio.phase === "idle" ? 1 : studio.phase === "extracted" ? 2 : 3} of 3
                  </span>
                </div>

                <div className="pipeline">
                  {[
                    { n: 1, label: "Upload Resume",       done: studio.phase !== "idle" },
                    { n: 2, label: "Add Job Description", done: !!studio.jobDesc.trim() && studio.phase !== "idle" },
                    { n: 3, label: "Get Analysis",        done: studio.phase === "done" },
                  ].map((s, i, arr) => (
                    <div className="pipeline-step" key={s.n}>
                      <div className={`step-circle ${s.done ? "step-done" : ""}`}>{s.done ? "✓" : s.n}</div>
                      <span className={`step-label ${s.done ? "step-label-done" : ""}`}>{s.label}</span>
                      {i < arr.length - 1 && <div className={`step-line ${s.done ? "step-line-done" : ""}`} />}
                    </div>
                  ))}
                </div>

                <div className="glass-card">
                  <h2 className="card-title">1 — Upload Your Resume</h2>
                  <div className={`dropzone ${studio.resumeFile ? "dropzone-has-file" : ""}`}
                    onClick={() => studio.fileInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); studio.selectFile(e.dataTransfer.files[0] ?? null); }}>
                    <input ref={studio.fileInputRef} type="file" accept="application/pdf"
                      style={{ display: "none" }} onChange={e => studio.selectFile(e.target.files?.[0] ?? null)} />
                    {studio.resumeFile ? (
                      <div className="file-selected">
                        <span className="file-icon">📄</span>
                        <div>
                          <p className="file-name">{studio.resumeFile.name}</p>
                          <p className="file-size">{(studio.resumeFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <span className="file-change">Click to change</span>
                      </div>
                    ) : (
                      <div className="dropzone-prompt">
                        <span className="dropzone-icon">⬆️</span>
                        <p className="dropzone-text">Drop your PDF here, or click to browse</p>
                        <p className="dropzone-sub">Text-based PDFs only · not scanned images</p>
                      </div>
                    )}
                  </div>
                  <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={studio.uploadPDF}
                    disabled={!studio.resumeFile || studio.phase === "uploading"}>
                    {studio.phase === "uploading" ? <><span className="spinner" /> Extracting…</> : "✦ Extract Resume Text"}
                  </button>
                  {(studio.phase === "extracted" || studio.phase === "generating" || studio.phase === "done") && (
                    <div className="alert alert-success">
                      ✅ {studio.wordCount(studio.resumeText).toLocaleString()} words extracted
                      <button className="link-btn" onClick={() => studio.setShowPreview(v => !v)}>
                        {studio.showPreview ? "Hide" : "Preview"}
                      </button>
                    </div>
                  )}
                  {studio.showPreview && studio.resumeText && (
                    <pre className="text-preview">
                      {studio.resumeText.slice(0, 1500)}{studio.resumeText.length > 1500 ? "\n\n… (truncated)" : ""}
                    </pre>
                  )}
                  {studio.error && studio.phase === "idle" && (
                    <div className="alert alert-error">❌ {studio.error}</div>
                  )}
                </div>

                <div className={`glass-card ${studio.phase === "idle" ? "card-locked" : ""}`}>
                  {studio.phase === "idle" && <div className="lock-overlay">Extract your resume first (Step 1)</div>}
                  <h2 className="card-title">2 — Paste Job Description</h2>
                  <textarea className="textarea"
                    placeholder="Paste the full job description here. More detail = better analysis."
                    value={studio.jobDesc} onChange={e => studio.setJobDesc(e.target.value)}
                    disabled={studio.phase === "idle" || studio.phase === "uploading"} rows={8} />
                  <div className="textarea-meta">{studio.wordCount(studio.jobDesc).toLocaleString()} words</div>
                </div>

                <div className={`glass-card ${studio.phase === "idle" || !studio.jobDesc.trim() ? "card-locked" : ""}`}>
                  {(studio.phase === "idle" || !studio.jobDesc.trim()) && (
                    <div className="lock-overlay">Complete Steps 1 & 2 first</div>
                  )}
                  <h2 className="card-title">3 — Analyze Resume</h2>
                  <button className="btn btn-accent" style={{ width: "100%" }} onClick={studio.analyzeResume}
                    disabled={studio.phase === "idle" || !studio.jobDesc.trim() || studio.phase === "generating" || studio.phase === "uploading"}>
                    {studio.phase === "generating"
                      ? <><span className="spinner" /> Analyzing your resume…</>
                      : "🔍 Analyze Against Job Description"}
                  </button>
                  {studio.error && (studio.phase === "extracted" || studio.phase === "done") && (
                    <div className="alert alert-error" style={{ marginTop: 12 }}>❌ {studio.error}</div>
                  )}
                </div>

                {studio.analysis && (
                  <>
                    <div className="glass-card" style={{ textAlign: "center", padding: "32px 24px" }}>
                      <div style={{
                        fontSize: 64, fontWeight: 800, lineHeight: 1,
                        background: "linear-gradient(135deg, #a78bfa, #38bdf8)",
                        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                      }}>{studio.analysis.overallScore}</div>
                      <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginTop: 6 }}>ATS Match Score / 100</div>
                      <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.07)", margin: "16px auto 0", maxWidth: 320 }}>
                        <div style={{
                          height: "100%", borderRadius: 99, width: `${studio.analysis.overallScore}%`,
                          background: "linear-gradient(90deg, #a78bfa, #38bdf8)", transition: "width 0.8s ease",
                        }} />
                      </div>
                      <p style={{ fontSize: 13, color: "#94a3b8", maxWidth: 520, margin: "16px auto 0", lineHeight: 1.7 }}>
                        {studio.analysis.summary}
                      </p>
                    </div>

                    <div className="glass-card">
                      <h2 className="card-title">📋 Section-by-Section Feedback</h2>
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {studio.analysis.sections.map((sec) => {
                          const statusColor = sec.status === "Good" ? "#6ee7b7" : sec.status === "Needs Work" ? "#fde68a" : "#fca5a5";
                          const statusBg = sec.status === "Good" ? "rgba(16,185,129,0.12)" : sec.status === "Needs Work" ? "rgba(251,191,36,0.12)" : "rgba(239,68,68,0.12)";
                          const statusBorder = sec.status === "Good" ? "rgba(16,185,129,0.3)" : sec.status === "Needs Work" ? "rgba(251,191,36,0.3)" : "rgba(239,68,68,0.3)";
                          return (
                            <div key={sec.name} style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", padding: "16px 18px", background: "rgba(255,255,255,0.02)" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: "#e2e8f0" }}>{sec.name}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: statusBg, color: statusColor, border: `1px solid ${statusBorder}` }}>{sec.status}</span>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa" }}>{sec.score}/100</span>
                                </div>
                              </div>
                              <div style={{ height: 3, borderRadius: 99, background: "rgba(255,255,255,0.07)", marginBottom: 12 }}>
                                <div style={{ height: "100%", borderRadius: 99, width: `${sec.score}%`, background: statusColor, transition: "width 0.6s ease" }} />
                              </div>
                              <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12, lineHeight: 1.65 }}>{sec.feedback}</p>
                              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
                                {sec.suggestions.map((s, i) => (
                                  <li key={i} style={{ fontSize: 12, color: "#cbd5e1", display: "flex", gap: 8, alignItems: "flex-start" }}>
                                    <span style={{ color: "#a78bfa", flexShrink: 0, marginTop: 1 }}>→</span>{s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="two-col-grid">
                      <div className="glass-card">
                        <h2 className="card-title">🔑 Missing Keywords</h2>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {studio.analysis.missingKeywords.map(kw => (
                            <span key={kw} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 99, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>{kw}</span>
                          ))}
                        </div>
                      </div>
                      <div className="glass-card">
                        <h2 className="card-title">⚡ Quick Wins</h2>
                        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                          {studio.analysis.quickWins.map((win, i) => (
                            <li key={i} style={{ fontSize: 12, color: "#cbd5e1", display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.6 }}>
                              <span style={{ color: "#6ee7b7", flexShrink: 0, marginTop: 1 }}>✓</span>{win}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}

const globalStyles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #07080f; color: #e2e8f0; font-family: 'Inter', system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.6; min-height: 100vh; }
  .layout { display: flex; min-height: 100vh; }
  .content-area { flex: 1; display: flex; flex-direction: column; min-width: 0; background: radial-gradient(ellipse 80% 60% at 60% -10%, rgba(99,102,241,0.12) 0%, transparent 70%), #07080f; }

  .sidebar { width: 240px; flex-shrink: 0; background: rgba(7,8,15,0.95); border-right: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; padding: 0 12px 24px; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
  .sidebar-logo { display: flex; align-items: center; gap: 8px; padding: 20px 8px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 12px; }
  .sidebar-logo-icon { font-size: 20px; }
  .sidebar-logo-text { font-size: 18px; font-weight: 700; letter-spacing: -0.5px; background: linear-gradient(135deg, #a78bfa, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .sidebar-nav { display: flex; flex-direction: column; gap: 2px; margin-bottom: 24px; }
  .sidebar-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 9px; border: none; background: transparent; color: #64748b; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; text-align: left; width: 100%; }
  .sidebar-item:hover { background: rgba(255,255,255,0.05); color: #94a3b8; }
  .sidebar-item-active { background: rgba(99,102,241,0.15) !important; color: #a78bfa !important; }
  .sidebar-item-icon { font-size: 16px; width: 20px; text-align: center; }
  .sidebar-item-label { flex: 1; }
  .sidebar-badge { font-size: 9px; font-weight: 700; padding: 2px 6px; background: rgba(167,139,250,0.2); color: #a78bfa; border-radius: 99px; }
  .sidebar-stats { margin-bottom: 20px; }
  .sidebar-stats-title { font-size: 10px; font-weight: 700; color: #334155; letter-spacing: 1px; text-transform: uppercase; padding: 0 4px; margin-bottom: 10px; }
  .sidebar-stat { display: flex; align-items: center; gap: 10px; padding: 8px 4px; border-radius: 8px; transition: background 0.12s; }
  .sidebar-stat:hover { background: rgba(255,255,255,0.03); }
  .sidebar-stat-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
  .sidebar-stat-value { font-size: 15px; font-weight: 700; color: #e2e8f0; }
  .sidebar-stat-label { font-size: 11px; color: #475569; }
  .sidebar-footer { margin-top: auto; display: flex; align-items: center; gap: 10px; padding: 12px 4px; border-top: 1px solid rgba(255,255,255,0.05); }
  .sidebar-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0; }
  .sidebar-footer-name { font-size: 13px; font-weight: 600; color: #e2e8f0; }
  .sidebar-footer-sub { font-size: 11px; color: #475569; }

  .topbar { display: flex; align-items: center; gap: 8px; padding: 12px 28px; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(7,8,15,0.6); backdrop-filter: blur(12px); position: sticky; top: 0; z-index: 40; }
  .topbar-tab { padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); color: #64748b; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 6px; }
  .topbar-tab:hover { color: #94a3b8; background: rgba(255,255,255,0.07); }
  .topbar-tab-active { color: #a78bfa !important; border-color: rgba(167,139,250,0.3) !important; background: rgba(99,102,241,0.1) !important; }
  .topbar-tab-accent { background: linear-gradient(135deg, #6366f1, #8b5cf6) !important; border-color: transparent !important; color: #fff !important; }
  .topbar-tab-active-accent { opacity: 0.85; }

  .main { padding: 28px 28px 80px; }
  .tab-content { display: flex; flex-direction: column; gap: 20px; }
  .two-col-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  .dash-hero { margin-bottom: 4px; }
  .dash-title { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 6px; background: linear-gradient(135deg, #a78bfa, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .dash-sub { font-size: 13px; color: #64748b; max-width: 560px; }

  .dash-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .dash-stat-card { display: flex; flex-direction: column; align-items: flex-start; padding: 18px 16px; gap: 4px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; transition: background 0.15s; }
  .dash-stat-card:hover { background: rgba(255,255,255,0.05); }
  .dash-stat-icon { width: 36px; height: 36px; border-radius: 9px; font-size: 16px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
  .dash-stat-value { font-size: 26px; font-weight: 800; line-height: 1; }
  .dash-stat-label { font-size: 13px; font-weight: 600; color: #94a3b8; margin-top: 2px; }
  .dash-stat-sub { font-size: 11px; color: #475569; }

  .dash-cta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .dash-cta-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 12px; }
  .dash-cta-icon { width: 44px; height: 44px; border-radius: 12px; font-size: 20px; display: flex; align-items: center; justify-content: center; }
  .dash-cta-title { font-size: 16px; font-weight: 700; color: #e2e8f0; }
  .dash-cta-desc { font-size: 13px; color: #64748b; line-height: 1.6; flex: 1; }

  .dash-features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .dash-feature-card { padding: 18px 16px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; transition: background 0.15s; }
  .dash-feature-card:hover { background: rgba(255,255,255,0.04); }

  .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .stat-card { display: flex; flex-direction: column; align-items: flex-start; padding: 18px 16px; gap: 2px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; }
  .stat-card-icon { width: 34px; height: 34px; border-radius: 9px; font-size: 15px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
  .stat-value { font-size: 24px; font-weight: 800; line-height: 1; }
  .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

  .glass-card { position: relative; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 24px; overflow: hidden; }
  .glass-card::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(135deg, rgba(167,139,250,0.04) 0%, transparent 60%); pointer-events: none; }
  .card-locked { opacity: 0.5; pointer-events: none; }
  .lock-overlay { position: absolute; inset: 0; z-index: 5; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: rgba(7,8,15,0.45); font-size: 13px; color: #64748b; backdrop-filter: blur(2px); }
  .card-title { font-size: 15px; font-weight: 600; color: #e2e8f0; margin-bottom: 16px; }

  .add-form { display: flex; gap: 10px; flex-wrap: wrap; }
  .input { flex: 1; min-width: 160px; padding: 10px 14px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 8px; color: #e2e8f0; font-size: 14px; outline: none; transition: border-color 0.15s; }
  .input:focus { border-color: rgba(167,139,250,0.5); }
  .input::placeholder { color: #475569; }

  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 18px; border-radius: 8px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }
  .btn-primary { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; }
  .btn-primary:not(:disabled):hover { opacity: 0.88; transform: translateY(-1px); }
  .btn-accent { background: linear-gradient(135deg, #06b6d4, #3b82f6); color: #fff; padding: 13px 20px; }
  .btn-accent:not(:disabled):hover { opacity: 0.88; transform: translateY(-1px); }
  .btn-ghost-danger { background: transparent; border: none; color: #475569; font-size: 13px; cursor: pointer; padding: 4px 8px; border-radius: 5px; transition: all 0.15s; }
  .btn-ghost-danger:hover { color: #f87171; background: rgba(248,113,113,0.1); }
  .link-btn { margin-left: auto; background: transparent; border: none; color: #6ee7b7; font-size: 12px; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }

  .badge { display: inline-block; padding: 1px 8px; background: rgba(167,139,250,0.15); color: #a78bfa; border-radius: 99px; font-size: 11px; font-weight: 600; margin-left: 6px; }

  .app-list { display: flex; flex-direction: column; gap: 8px; }
  .app-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 9px; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.05); transition: background 0.12s; gap: 12px; flex-wrap: wrap; }
  .app-row:hover { background: rgba(255,255,255,0.045); }
  .app-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .app-company { font-size: 14px; font-weight: 600; color: #e2e8f0; }
  .app-role { font-size: 12px; color: #64748b; }
  .app-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .status-pill { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; white-space: nowrap; }
  .status-select { padding: 5px 8px; border-radius: 6px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.09); color: #e2e8f0; font-size: 12px; cursor: pointer; outline: none; }

  .skeleton-list { display: flex; flex-direction: column; gap: 8px; }
  .skeleton-row { height: 56px; border-radius: 9px; background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.04) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
  @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }

  .empty { text-align: center; padding: 36px 0; }
  .empty-icon { font-size: 32px; margin-bottom: 8px; }
  .empty-text { color: #475569; font-size: 13px; }

  .step-badge { font-size: 12px; font-weight: 600; padding: 5px 12px; background: rgba(167,139,250,0.15); color: #a78bfa; border-radius: 99px; border: 1px solid rgba(167,139,250,0.25); white-space: nowrap; }
  .studio-header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }

  .pipeline { display: flex; align-items: flex-start; gap: 0; padding: 0 4px; }
  .pipeline-step { flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; gap: 8px; }
  .step-line { position: absolute; top: 14px; left: 50%; width: 100%; height: 1px; background: rgba(255,255,255,0.07); z-index: 0; transition: background 0.3s; }
  .step-line-done { background: rgba(167,139,250,0.35); }
  .step-circle { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; z-index: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #64748b; transition: all 0.25s; }
  .step-done { background: rgba(99,102,241,0.25) !important; border-color: rgba(167,139,250,0.55) !important; color: #a78bfa !important; }
  .step-label { font-size: 11px; color: #475569; text-align: center; }
  .step-label-done { color: #94a3b8; }

  .dropzone { padding: 28px; border-radius: 10px; border: 1.5px dashed rgba(255,255,255,0.1); cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; min-height: 110px; }
  .dropzone:hover { border-color: rgba(167,139,250,0.4); background: rgba(167,139,250,0.04); }
  .dropzone-has-file { border-color: rgba(110,231,183,0.3); background: rgba(110,231,183,0.03); }
  .dropzone-prompt { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
  .dropzone-icon { font-size: 28px; }
  .dropzone-text { font-size: 13px; color: #94a3b8; }
  .dropzone-sub { font-size: 11px; color: #475569; }
  .file-selected { display: flex; align-items: center; gap: 12px; width: 100%; }
  .file-icon { font-size: 24px; flex-shrink: 0; }
  .file-name { font-size: 13px; font-weight: 600; color: #a78bfa; }
  .file-size { font-size: 11px; color: #64748b; margin-top: 2px; }
  .file-change { margin-left: auto; font-size: 11px; color: #475569; flex-shrink: 0; }

  .alert { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-top: 12px; }
  .alert-success { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25); color: #6ee7b7; }
  .alert-error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #fca5a5; }

  .text-preview { margin-top: 12px; padding: 14px; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); font-size: 11.5px; line-height: 1.7; color: #94a3b8; white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto; }

  .textarea { width: 100%; padding: 12px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #e2e8f0; font-size: 13px; line-height: 1.6; resize: vertical; outline: none; font-family: inherit; transition: border-color 0.15s; }
  .textarea:focus { border-color: rgba(99,102,241,0.5); }
  .textarea::placeholder { color: #475569; }
  .textarea:disabled { opacity: 0.5; cursor: not-allowed; }
  .textarea-meta { font-size: 11px; color: #475569; margin-top: 6px; text-align: right; }

  .spinner { width: 13px; height: 13px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.2); border-top-color: #fff; animation: spin 0.7s linear infinite; display: inline-block; flex-shrink: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }

  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }

  @media (max-width: 900px) { .sidebar { width: 200px; } .dash-stats { grid-template-columns: repeat(2, 1fr); } .dash-cta-grid { grid-template-columns: 1fr; } .dash-features { grid-template-columns: 1fr; } }
  @media (max-width: 640px) { .sidebar { display: none; } .stats-row { grid-template-columns: repeat(2, 1fr); } .two-col-grid { grid-template-columns: 1fr; } .add-form { flex-direction: column; } .dash-stats { grid-template-columns: repeat(2, 1fr); } }
`;