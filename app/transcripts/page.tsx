"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  listCallTranscripts,
  getCallTranscript,
  createCallTranscript,
  updateCallTranscript,
  deleteCallTranscript,
} from "@/lib/db";
import type { CallTranscript } from "@/lib/database.types";

type Classification = "good" | "bad" | "unclassified";

const CLASS_STYLES: Record<Classification, { label: string; color: string; bg: string }> = {
  good: { label: "Good", color: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/30" },
  bad: { label: "Bad", color: "text-red-400", bg: "bg-red-500/20 border-red-500/30" },
  unclassified: { label: "Unclassified", color: "text-gray-400", bg: "bg-gray-500/20 border-gray-500/30" },
};

function ClassBadge({ classification }: { classification: Classification }) {
  const s = CLASS_STYLES[classification];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${s.bg} ${s.color}`}>
      {s.label}
    </span>
  );
}

// --- Upload Modal ---

function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".txt")) {
      setError("Only .txt files are supported");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setContent(text);
      if (!title) setTitle(file.name.replace(/\.txt$/, ""));
    };
    reader.readAsText(file);
  }

  async function handleUpload() {
    if (!content.trim()) return;
    setUploading(true);
    setError(null);
    try {
      await createCallTranscript(title || "Untitled Transcript", content);
      onUploaded();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-700 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-white">Upload Call Transcript</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {error && <p className="text-sm text-red-400">{error}</p>}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Call title..."
              className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Upload .txt file</label>
            <input
              type="file"
              accept=".txt"
              onChange={handleFileChange}
              className="w-full text-sm text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white file:cursor-pointer hover:file:bg-indigo-500"
            />
          </div>

          {content && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Preview</label>
              <pre className="max-h-40 overflow-auto rounded-lg border border-gray-700 bg-gray-800 p-3 text-xs text-gray-300 whitespace-pre-wrap">
                {content.slice(0, 2000)}{content.length > 2000 ? "\n..." : ""}
              </pre>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading || !content.trim()}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
          >
            {uploading ? "Uploading..." : "Upload Transcript"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Detail View ---

function TranscriptDetail({
  transcript,
  onBack,
  onUpdate,
  onDelete,
}: {
  transcript: CallTranscript;
  onBack: () => void;
  onUpdate: (updated: Partial<CallTranscript>) => void;
  onDelete: () => void;
}) {
  const [notes, setNotes] = useState(transcript.notes);
  const [classification, setClassification] = useState<Classification>(transcript.classification);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(transcript.ai_analysis);
  const [error, setError] = useState<string | null>(null);

  async function handleSaveNotes() {
    setSaving(true);
    try {
      await updateCallTranscript(transcript.id, { notes, classification });
      onUpdate({ notes, classification });
    } catch (err: any) {
      setError(err?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcript.content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAnalysis(data.analysis);
      if (data.classification && data.classification !== "unclassified") {
        setClassification(data.classification);
      }

      await updateCallTranscript(transcript.id, {
        ai_analysis: data.analysis,
        classification: data.classification !== "unclassified" ? data.classification : classification,
      });
      onUpdate({
        ai_analysis: data.analysis,
        classification: data.classification !== "unclassified" ? data.classification : classification,
      });
    } catch (err: any) {
      setError(err?.message ?? "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <header>
        <button
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-gray-200"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Transcripts
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-white sm:text-xl">{transcript.title}</h1>
          <ClassBadge classification={classification} />
        </div>
        <p className="mt-1 text-xs text-gray-500">{new Date(transcript.created_at).toLocaleString()}</p>
      </header>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Transcript content */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 sm:p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Transcript</h2>
        <pre className="max-h-80 overflow-auto text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
          {transcript.content}
        </pre>
      </div>

      {/* Classification + Notes */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 sm:p-5 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Notes & Classification</h2>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Classification</label>
          <div className="flex gap-2">
            {(["good", "bad", "unclassified"] as Classification[]).map((c) => (
              <button
                key={c}
                onClick={() => setClassification(c)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  classification === c
                    ? CLASS_STYLES[c].bg + " " + CLASS_STYLES[c].color
                    : "border-gray-600 text-gray-500 hover:border-gray-500"
                }`}
              >
                {CLASS_STYLES[c].label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about this call..."
            rows={4}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSaveNotes}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save Notes"}
          </button>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
          >
            {analyzing ? "Analyzing..." : analysis ? "Re-analyze with AI" : "Analyze with AI"}
          </button>
        </div>
      </div>

      {/* AI Analysis */}
      {analysis && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 sm:p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">AI Analysis</h2>
          <div className="prose prose-invert prose-sm max-w-none text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
            {analysis}
          </div>
        </div>
      )}

      {/* Delete */}
      <button
        onClick={onDelete}
        className="text-xs text-gray-500 transition hover:text-red-400"
      >
        Delete this transcript
      </button>
    </div>
  );
}

// --- Q&A Panel ---

function QAPanel({ transcripts }: { transcripts: CallTranscript[] }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk() {
    if (!question.trim()) return;
    setAsking(true);
    setError(null);
    setAnswer("");
    try {
      const res = await fetch("/api/ask-transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          transcripts: transcripts.map((t) => ({
            title: t.title,
            content: t.content,
            classification: t.classification,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAnswer(data.answer);
    } catch (err: any) {
      setError(err?.message ?? "Failed to get answer");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 sm:p-5 space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Ask About Your Transcripts
      </h2>
      <p className="text-xs text-gray-500">
        Ask questions across all {transcripts.length} transcript{transcripts.length !== 1 ? "s" : ""}. e.g. &quot;What are the most common questions?&quot;
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAsk();
            }
          }}
          placeholder="What are the most common customer questions?"
          className="min-w-0 flex-1 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
        <button
          onClick={handleAsk}
          disabled={asking || !question.trim() || transcripts.length === 0}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
        >
          {asking ? "Thinking..." : "Ask"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {answer && (
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{answer}</div>
        </div>
      )}
    </div>
  );
}

// --- Main Page ---

export default function TranscriptsPage() {
  const [transcripts, setTranscripts] = useState<CallTranscript[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTranscript, setSelectedTranscript] = useState<CallTranscript | null>(null);
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCallTranscripts();
      setTranscripts(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSelect(id: string) {
    try {
      const t = await getCallTranscript(id);
      setSelectedId(id);
      setSelectedTranscript(t);
    } catch {
      // silent
    }
  }

  function handleBack() {
    setSelectedId(null);
    setSelectedTranscript(null);
  }

  async function handleDelete() {
    if (!selectedId) return;
    if (!window.confirm("Are you sure you want to delete this transcript? This action cannot be undone.")) return;
    try {
      await deleteCallTranscript(selectedId);
      setTranscripts((prev) => prev.filter((t) => t.id !== selectedId));
      handleBack();
    } catch {
      // silent
    }
  }

  function handleUpdate(updated: Partial<CallTranscript>) {
    if (!selectedId) return;
    setTranscripts((prev) =>
      prev.map((t) => (t.id === selectedId ? { ...t, ...updated } : t))
    );
    setSelectedTranscript((prev) => prev ? { ...prev, ...updated } : null);
  }

  const filtered = search.trim()
    ? transcripts.filter(
        (t) =>
          t.title.toLowerCase().includes(search.toLowerCase()) ||
          t.content.toLowerCase().includes(search.toLowerCase())
      )
    : transcripts;

  const counts = {
    total: transcripts.length,
    good: transcripts.filter((t) => t.classification === "good").length,
    bad: transcripts.filter((t) => t.classification === "bad").length,
    unclassified: transcripts.filter((t) => t.classification === "unclassified").length,
  };

  // Detail view
  if (selectedId && selectedTranscript) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 px-3 py-6 pb-[env(safe-area-inset-bottom)] sm:gap-6 sm:px-4 sm:py-10">
        <TranscriptDetail
          transcript={selectedTranscript}
          onBack={handleBack}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      </div>
    );
  }

  // List view
  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-4 px-3 py-6 pb-[env(safe-area-inset-bottom)] sm:gap-6 sm:px-4 sm:py-10">
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUploaded={loadData} />}

      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Call Transcripts
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload, analyze, and ask questions about call transcripts
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-3 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800 self-start"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Console
        </Link>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {[
          { label: "Total", count: counts.total, color: "border-gray-600 text-gray-300" },
          { label: "Good", count: counts.good, color: "border-emerald-500/30 text-emerald-400" },
          { label: "Bad", count: counts.bad, color: "border-red-500/30 text-red-400" },
          { label: "Unclassified", count: counts.unclassified, color: "border-gray-500/30 text-gray-400" },
        ].map((s) => (
          <div key={s.label} className={`rounded-lg border p-2.5 text-center sm:p-3 ${s.color} bg-gray-800/50`}>
            <div className="text-lg font-bold sm:text-xl">{s.count}</div>
            <div className="text-[10px] uppercase tracking-wider sm:text-xs">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + Upload */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transcripts..."
          className="min-w-0 flex-1 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
        <button
          onClick={() => setShowUpload(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 whitespace-nowrap"
        >
          + Upload Transcript
        </button>
      </div>

      {/* Q&A Panel */}
      {transcripts.length > 0 && <QAPanel transcripts={transcripts} />}

      {/* List */}
      {loading ? (
        <div className="py-20 text-center text-gray-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-gray-500">
          {transcripts.length === 0
            ? "No transcripts uploaded yet. Click \"Upload Transcript\" to get started."
            : "No results match your search."}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 backdrop-blur">
          {filtered.map((t) => (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelect(t.id)}
              onKeyDown={(e) => e.key === "Enter" && handleSelect(t.id)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 border-b border-gray-700/50 px-4 py-3.5 text-left transition active:bg-gray-700/40 hover:bg-gray-700/30 last:border-b-0 sm:px-5 sm:py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-gray-200">{t.title}</p>
                  <ClassBadge classification={t.classification} />
                </div>
                <p className="mt-0.5 text-xs text-gray-500 truncate">
                  {t.content.slice(0, 100)}{t.content.length > 100 ? "..." : ""}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-600">
                  {new Date(t.created_at).toLocaleString()}
                </p>
              </div>
              {t.ai_analysis && (
                <span className="shrink-0 rounded-full bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-medium text-indigo-400">
                  Analyzed
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
