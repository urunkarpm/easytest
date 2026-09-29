"use client";

import { useState, useEffect } from "react";
import { ScanJob, Finding, HeadingInfo, ImageInfo, LinkResult, ToolRecommendation } from "@/types/audit";
import { Search, AlertTriangle, CheckCircle2, Download, ExternalLink, ShieldAlert, ArrowRight, Loader2, Layers, Image as ImageIcon, Link as LinkIcon, FileText, Info } from "lucide-react";

export default function Home() {
  const [urlInput, setUrlInput] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ScanJob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "headings" | "images" | "links" | "tools">("overview");
  const [screenshotMode, setScreenshotMode] = useState<"annotated" | "raw" | "headings" | "images" | "links">("annotated");

  // Poll job status every 2 seconds when scanning
  useEffect(() => {
    if (!jobId || (job && (job.status === "ready" || job.status === "failed"))) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scan/${jobId}`);
        if (res.ok) {
          const data: ScanJob = await res.json();
          setJob(data);
          if (data.status === "failed") {
            setErrorMessage(data.error || "Scan failed.");
          }
        } else if (res.status === 404) {
          setErrorMessage("Scan job expired or not found.");
          setJobId(null);
        }
      } catch (err: any) {
        console.error("Polling error:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, job]);

  const handleStartScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setDownloadError(null);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlInput.trim(),
          previousJobId: jobId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Failed to initiate scan.");
        setIsSubmitting(false);
        return;
      }

      setJobId(data.jobId);
      setJob({
        jobId: data.jobId,
        targetUrl: urlInput.trim(),
        domain: new URL(urlInput.trim()).hostname,
        createdAt: new Date().toISOString(),
        status: "queued",
        progressPercent: 5,
        currentStage: "Initializing scan job...",
      });
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred starting the scan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadZip = () => {
    if (!jobId) return;
    setDownloadError(null);
    window.location.href = `/api/download/${jobId}`;
  };

  const getActiveScreenshotUrl = () => {
    if (!job?.reportUrls) return undefined;
    switch (screenshotMode) {
      case "raw":
        return job.reportUrls.rawPngUrl;
      case "headings":
        return job.reportUrls.headingsPngUrl || job.reportUrls.annotatedPngUrl;
      case "images":
        return job.reportUrls.imagesPngUrl || job.reportUrls.annotatedPngUrl;
      case "links":
        return job.reportUrls.linksPngUrl || job.reportUrls.annotatedPngUrl;
      case "annotated":
      default:
        return job.reportUrls.annotatedPngUrl;
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header / Brand Nav */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-sky-500 text-slate-950 p-2 rounded-lg font-bold flex items-center justify-center">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-50 tracking-tight">PageAudit</h1>
              <p className="text-xs text-slate-400">Visual Accessibility & Link Quality Auditor</p>
            </div>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Vercel Serverless Ready
          </div>
        </div>
      </header>

      {/* Hero Input Section */}
      <section className="py-12 bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-800/80 px-4">
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Audit Any Webpage in Seconds
          </h2>
          <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
            Extract heading hierarchy, image accessible names, and broken links with full-page annotated screenshot overlays and downloadable ZIP reports.
          </p>

          <form onSubmit={handleStartScan} className="mt-6 flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto">
            <div className="relative flex-1">
              <input
                type="url"
                required
                placeholder="https://example.com/page"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-700 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-lg px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || (job !== null && job.status !== "ready" && job.status !== "failed")}
              className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold px-6 py-3 rounded-lg text-sm transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-sky-500/10"
            >
              {isSubmitting || (job && job.status !== "ready" && job.status !== "failed") ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  Scan Page
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Expiration & Policy Notice */}
          <div className="pt-2 flex items-center justify-center gap-2 text-xs text-amber-400/90">
            <Info className="w-3.5 h-3.5" />
            <span>Notice: Reports are available for <strong>one single download</strong> and expire in 30 minutes.</span>
          </div>

          {errorMessage && (
            <div className="mt-4 p-3 bg-red-950/80 border border-red-800 text-red-200 text-xs rounded-lg flex items-center gap-2 max-w-xl mx-auto">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      </section>

      {/* Main Content Area */}
      <section className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Progress Display */}
        {job && job.status !== "ready" && job.status !== "failed" && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />
                <div>
                  <div className="font-semibold text-slate-200">{job.currentStage}</div>
                  <div className="text-xs text-slate-400">Target: {job.targetUrl}</div>
                </div>
              </div>
              <span className="font-mono text-sky-400 font-bold">{job.progressPercent}%</span>
            </div>

            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-sky-500 to-indigo-500 h-full transition-all duration-300"
                style={{ width: `${job.progressPercent}%` }}
              ></div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-slate-400 pt-2 border-t border-slate-800/60">
              <span className={job.progressPercent >= 5 ? "text-sky-400 font-semibold" : ""}>1. Queued</span>
              <span className={job.progressPercent >= 30 ? "text-sky-400 font-semibold" : ""}>2. Loading Page</span>
              <span className={job.progressPercent >= 55 ? "text-sky-400 font-semibold" : ""}>3. Screenshot</span>
              <span className={job.progressPercent >= 70 ? "text-sky-400 font-semibold" : ""}>4. Checking Links</span>
              <span className={job.progressPercent >= 85 ? "text-sky-400 font-semibold" : ""}>5. Building Report</span>
            </div>
          </div>
        )}

        {/* Audit Results Dashboard */}
        {job && job.status === "ready" && (
          <div className="space-y-8">
            {/* Top Stats Banner */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-xl font-bold text-white">Scan Complete: {job.domain}</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Job ID: <span className="font-mono text-slate-300">{job.jobId}</span> &bull; Scanned at {new Date(job.createdAt).toLocaleTimeString()}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    onClick={handleDownloadZip}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10"
                  >
                    <Download className="w-4 h-4" />
                    Download Report ZIP
                  </button>
                </div>
              </div>

              {job.truncatedPage && (
                <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-lg text-amber-200 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Note: Page height ({job.originalHeight}px) exceeded maximum browser height limit (30,000px). Screenshot and DOM capture were truncated to {job.capturedHeight}px.
                  </span>
                </div>
              )}

              {/* Stat Cards Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-lg">
                  <div className="text-xs text-slate-400 uppercase font-semibold">Headings (H1-H6)</div>
                  <div className="text-2xl font-bold text-slate-100 mt-1">{job.stats?.totalHeadings || 0}</div>
                  <div className="text-xs mt-1 text-slate-400">
                    <span className={job.stats?.headingErrors ? "text-amber-400 font-semibold" : "text-emerald-400"}>
                      {job.stats?.headingErrors || 0} Issues
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-lg">
                  <div className="text-xs text-slate-400 uppercase font-semibold">Images</div>
                  <div className="text-2xl font-bold text-slate-100 mt-1">{job.stats?.totalImages || 0}</div>
                  <div className="text-xs mt-1 text-slate-400">
                    <span className={job.stats?.imagesMissingAlt ? "text-red-400 font-semibold" : "text-emerald-400"}>
                      {job.stats?.imagesMissingAlt || 0} Missing Alt
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-lg">
                  <div className="text-xs text-slate-400 uppercase font-semibold">Links Audited</div>
                  <div className="text-2xl font-bold text-slate-100 mt-1">
                    {job.stats?.totalLinks || 0} {job.stats?.cappedLinks ? "(Capped 500)" : ""}
                  </div>
                  <div className="text-xs mt-1 text-slate-400 flex items-center gap-1.5">
                    <span className="text-emerald-400">{job.stats?.passedLinks || 0} Pass</span>
                    <span>/</span>
                    <span className="text-red-400">{job.stats?.failedLinks || 0} Fail</span>
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-lg">
                  <div className="text-xs text-slate-400 uppercase font-semibold">Scan Duration</div>
                  <div className="text-2xl font-bold text-slate-100 mt-1">
                    {((job.stats?.durationMs || 0) / 1000).toFixed(2)}s
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Automated Playwright</div>
                </div>
              </div>
            </div>

            {/* Results Navigation Tabs */}
            <div className="border-b border-slate-800 flex items-center gap-2 overflow-x-auto">
              <button
                onClick={() => setActiveTab("overview")}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                  activeTab === "overview" ? "border-sky-500 text-sky-400" : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Layers className="w-4 h-4" />
                Annotated Screenshot & Findings
              </button>

              <button
                onClick={() => setActiveTab("headings")}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                  activeTab === "headings" ? "border-sky-500 text-sky-400" : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <FileText className="w-4 h-4" />
                Headings ({job.headings?.length || 0})
              </button>

              <button
                onClick={() => setActiveTab("images")}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                  activeTab === "images" ? "border-sky-500 text-sky-400" : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                Images ({job.images?.length || 0})
              </button>

              <button
                onClick={() => setActiveTab("links")}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                  activeTab === "links" ? "border-sky-500 text-sky-400" : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <LinkIcon className="w-4 h-4" />
                Link Health ({job.links?.length || 0})
              </button>

              <button
                onClick={() => setActiveTab("tools")}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                  activeTab === "tools" ? "border-sky-500 text-sky-400" : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                Recommended Tools ({job.tools?.length || 0})
              </button>
            </div>

            {/* TAB 1: OVERVIEW & ANNOTATED SCREENSHOT */}
            {activeTab === "overview" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Screenshot Viewer */}
                <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <span className="text-xs font-semibold text-slate-300">Visual Screenshot Overlay</span>
                    <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                      <button
                        onClick={() => setScreenshotMode("annotated")}
                        className={`px-2.5 py-1 rounded transition ${screenshotMode === "annotated" ? "bg-sky-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"}`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setScreenshotMode("headings")}
                        className={`px-2.5 py-1 rounded transition ${screenshotMode === "headings" ? "bg-purple-500 text-white font-bold" : "text-slate-400 hover:text-slate-200"}`}
                      >
                        Headings
                      </button>
                      <button
                        onClick={() => setScreenshotMode("images")}
                        className={`px-2.5 py-1 rounded transition ${screenshotMode === "images" ? "bg-blue-500 text-white font-bold" : "text-slate-400 hover:text-slate-200"}`}
                      >
                        Images
                      </button>
                      <button
                        onClick={() => setScreenshotMode("links")}
                        className={`px-2.5 py-1 rounded transition ${screenshotMode === "links" ? "bg-emerald-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"}`}
                      >
                        Links
                      </button>
                      <button
                        onClick={() => setScreenshotMode("raw")}
                        className={`px-2.5 py-1 rounded transition ${screenshotMode === "raw" ? "bg-slate-700 text-white font-bold" : "text-slate-400 hover:text-slate-200"}`}
                      >
                        Raw
                      </button>
                    </div>
                  </div>

                  <div className="overflow-auto max-h-[700px] border border-slate-800 rounded-lg bg-slate-950 p-2 flex justify-center">
                    {getActiveScreenshotUrl() ? (
                      <img
                        src={getActiveScreenshotUrl()}
                        alt="Audited Full-Page Screenshot"
                        className="max-w-full h-auto rounded"
                      />
                    ) : (
                      <div className="p-8 text-xs text-slate-500">Screenshot unavailable</div>
                    )}
                  </div>
                </div>

                {/* Key Findings List */}
                <div className="lg:col-span-5 space-y-4">
                  <h4 className="text-base font-bold text-slate-200">Key Accessibility & Structure Findings</h4>

                  {job.findings && job.findings.length > 0 ? (
                    <div className="space-y-3 max-h-[650px] overflow-y-auto pr-1">
                      {job.findings.map((f, i) => (
                        <div
                          key={i}
                          className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2 hover:border-slate-700 transition"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                                f.severity === "error"
                                  ? "bg-red-950 text-red-400 border border-red-800"
                                  : "bg-amber-950 text-amber-400 border border-amber-800"
                              }`}
                            >
                              {f.severity}
                            </span>
                            <span className="text-xs text-slate-400 capitalize">{f.category}</span>
                          </div>

                          <h5 className="text-sm font-semibold text-slate-100">{f.title}</h5>
                          <p className="text-xs text-slate-400">{f.message}</p>

                          {f.recommendation && (
                            <div className="text-xs bg-slate-950 p-2 rounded border border-slate-800 text-sky-400">
                              <strong>Remediation:</strong> {f.recommendation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg text-center space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                      <p className="text-sm text-slate-300">No critical structure or accessibility errors detected!</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: HEADINGS BREAKDOWN */}
            {activeTab === "headings" && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <h4 className="text-lg font-bold text-white">Heading Hierarchy Analysis</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-xs">
                      <tr>
                        <th className="p-3">Level</th>
                        <th className="p-3">Heading Content</th>
                        <th className="p-3">Issues / Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {job.headings?.map((h, i) => (
                        <tr key={i} className="hover:bg-slate-800/40">
                          <td className="p-3 font-mono font-bold text-purple-400">H{h.level}</td>
                          <td className="p-3 font-medium">{h.text || <em className="text-red-400">[EMPTY HEADING]</em>}</td>
                          <td className="p-3">
                            {h.issues.length > 0 ? (
                              <span className="text-xs text-amber-400 bg-amber-950/60 px-2 py-1 rounded border border-amber-800">
                                {h.issues.join(", ")}
                              </span>
                            ) : (
                              <span className="text-xs text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded border border-emerald-800">
                                OK
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: IMAGES BREAKDOWN */}
            {activeTab === "images" && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <h4 className="text-lg font-bold text-white">Image & Alt Attribute Audit</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-xs">
                      <tr>
                        <th className="p-3">Source / Alt</th>
                        <th className="p-3">Accessible Name</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Issues</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {job.images?.map((img, i) => (
                        <tr key={i} className="hover:bg-slate-800/40">
                          <td className="p-3 max-w-xs truncate">
                            <div className="font-semibold text-slate-200 truncate">{img.src}</div>
                            <div className="text-xs text-slate-500">Alt: {img.alt === null ? "(None)" : `"${img.alt}"`}</div>
                          </td>
                          <td className="p-3 text-xs">{img.accessibleName || "-"}</td>
                          <td className="p-3">
                            <span
                              className={`text-xs px-2 py-0.5 rounded font-bold uppercase ${
                                img.status === "pass"
                                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                  : img.status === "warning"
                                  ? "bg-amber-950 text-amber-400 border border-amber-800"
                                  : "bg-red-950 text-red-400 border border-red-800"
                              }`}
                            >
                              {img.status}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-slate-400">{img.issues.join(", ") || "None"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: LINKS BREAKDOWN */}
            {activeTab === "links" && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <h4 className="text-lg font-bold text-white">Server-Side Link Health</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-xs">
                      <tr>
                        <th className="p-3">Anchor Text / Href</th>
                        <th className="p-3">Status Code</th>
                        <th className="p-3">Result</th>
                        <th className="p-3">Response Time</th>
                        <th className="p-3">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {job.links?.map((link, i) => (
                        <tr key={i} className="hover:bg-slate-800/40">
                          <td className="p-3 max-w-sm truncate">
                            <div className="font-semibold text-slate-200 truncate">{link.text}</div>
                            <div className="text-xs text-slate-500 truncate">{link.href}</div>
                          </td>
                          <td className="p-3 font-mono text-xs">{link.statusCode || "-"}</td>
                          <td className="p-3">
                            <span
                              className={`text-xs px-2 py-0.5 rounded font-bold uppercase ${
                                link.status === "pass"
                                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                  : link.status === "redirect"
                                  ? "bg-blue-950 text-blue-400 border border-blue-800"
                                  : link.status === "unverifiable"
                                  ? "bg-amber-950 text-amber-400 border border-amber-800"
                                  : "bg-red-950 text-red-400 border border-red-800"
                              }`}
                            >
                              {link.status}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-xs">{link.responseTimeMs ? `${link.responseTimeMs}ms` : "-"}</td>
                          <td className="p-3 text-xs text-slate-400 max-w-xs truncate">{link.reason || link.finalUrl || "OK"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 5: RECOMMENDED TOOLS */}
            {activeTab === "tools" && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
                <div>
                  <h4 className="text-lg font-bold text-white">Recommended Next Steps & Tools</h4>
                  <p className="text-xs text-slate-400">
                    Curated suite of testing tools dynamically tailored to the findings detected on {job.domain}:
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {job.tools?.map((t, i) => (
                    <div key={i} className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h5 className="font-bold text-slate-100 flex items-center gap-1.5">
                          {t.name}
                          <a href={t.url} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-300">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </h5>
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded uppercase">{t.category}</span>
                      </div>
                      <p className="text-xs text-slate-400">{t.description}</p>
                      <div className="text-xs text-sky-400 bg-sky-950/40 border border-sky-900 p-2 rounded">
                        <strong>Why for this site:</strong> {t.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500 mt-auto">
        PageAudit &bull; Built with Next.js App Router, Playwright Core, and Vercel Blob/KV.
      </footer>
    </main>
  );
}
