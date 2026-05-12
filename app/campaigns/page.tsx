"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Campaign = {
  id: string;
  name: string;
  status: string | null;
  vapiAssistantId: string | null;
  vapiAssistantName: string | null;
  createdAt: string;
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  initiatedCalls: number;
  goalsReached: number;
  avgDurationSeconds: number | null;
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_CHIPS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400",
  running: "bg-emerald-500/20 text-emerald-400",
  paused: "bg-amber-500/20 text-amber-400",
  stopped: "bg-rose-500/20 text-rose-400",
  completed: "bg-indigo-500/20 text-indigo-400",
  draft: "bg-gray-700 text-gray-400",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState<string | null>(null);

  async function loadCampaigns() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load campaigns");
      setCampaigns(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setLoadError(e?.message ?? "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCampaigns(); }, []);

  const statuses = useMemo(() => {
    const s = new Set<string>();
    for (const c of campaigns) if (c.status) s.add(c.status);
    return Array.from(s).sort();
  }, [campaigns]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (activeStatus && c.status !== activeStatus) return false;
      if (q) {
        const hay = `${c.name} ${c.vapiAssistantName ?? ""} ${c.status ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [campaigns, search, activeStatus]);

  const totals = useMemo(() => {
    return campaigns.reduce(
      (acc, c) => {
        acc.totalCalls += c.totalCalls;
        acc.completedCalls += c.completedCalls;
        acc.goalsReached += c.goalsReached;
        return acc;
      },
      { totalCalls: 0, completedCalls: 0, goalsReached: 0 }
    );
  }, [campaigns]);

  return (
    <div className="flex flex-col px-4 py-6 pb-[env(safe-area-inset-bottom)] sm:px-6 sm:py-8">
      {/* Header */}
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filtered.length} of {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
            {campaigns.length > 0 && ` · ${totals.totalCalls} total calls · ${totals.completedCalls} completed · ${totals.goalsReached} goals reached`}
          </p>
        </div>
        <button
          onClick={loadCampaigns}
          disabled={loading}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium text-gray-300 transition hover:bg-gray-800 disabled:opacity-40"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {/* Status filter */}
      {statuses.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveStatus(null)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              activeStatus === null ? "bg-fuchsia-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
            }`}
          >
            All
          </button>
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setActiveStatus(s === activeStatus ? null : s)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                activeStatus === s ? "bg-fuchsia-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="mb-4 relative">
        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by campaign name, agent, status..."
          className="w-full rounded-lg border border-gray-700 bg-gray-800/50 py-2.5 pl-10 pr-4 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* Grid of cards */}
      {loading && <p className="px-5 py-10 text-center text-sm text-gray-500">Loading campaigns...</p>}
      {!loading && loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{loadError}</div>
      )}
      {!loading && !loadError && filtered.length === 0 && (
        <p className="rounded-xl border border-gray-700 bg-gray-800/50 px-5 py-10 text-center text-sm text-gray-500">
          {campaigns.length === 0 ? "No campaigns found." : "No campaigns match your filters."}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((c) => {
          const successRate = c.totalCalls > 0 ? Math.round((c.goalsReached / c.totalCalls) * 100) : 0;
          const completionRate = c.totalCalls > 0 ? Math.round((c.completedCalls / c.totalCalls) * 100) : 0;
          const statusClass = c.status ? (STATUS_CHIPS[c.status.toLowerCase()] ?? "bg-gray-700 text-gray-300") : "bg-gray-700 text-gray-400";
          return (
            <Link
              key={c.id}
              href={`/vapi-logs?campaign=${encodeURIComponent(c.id)}`}
              className="group rounded-xl border border-gray-700 bg-gray-800/50 p-4 transition hover:border-fuchsia-500/50 hover:bg-gray-800/80"
            >
              {/* Top row: status + date */}
              <div className="mb-2 flex items-start justify-between gap-2">
                {c.status && (
                  <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusClass}`}>
                    {c.status}
                  </span>
                )}
                <span className="text-[11px] text-gray-500">{formatDate(c.createdAt)}</span>
              </div>

              {/* Name */}
              <h3 className="mb-1 line-clamp-2 text-sm font-bold text-white group-hover:text-fuchsia-300">{c.name}</h3>

              {/* Agent */}
              {c.vapiAssistantName && (
                <p className="mb-3 truncate text-[11px] text-gray-500">
                  <span className="text-gray-600">Agent ·</span> {c.vapiAssistantName}
                </p>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2 border-t border-gray-700/60 pt-3 text-center">
                <div>
                  <p className="text-base font-bold text-white">{c.totalCalls}</p>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Calls</p>
                </div>
                <div>
                  <p className="text-base font-bold text-emerald-400">{completionRate}%</p>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Completed</p>
                </div>
                <div>
                  <p className="text-base font-bold text-fuchsia-400">{c.goalsReached}</p>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Goals</p>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-3 flex items-center justify-between border-t border-gray-700/60 pt-2 text-[11px]">
                <span className="text-gray-500">
                  Avg duration: <span className="text-gray-300">{formatDuration(c.avgDurationSeconds)}</span>
                </span>
                <span className="font-medium text-fuchsia-400 group-hover:text-fuchsia-300">
                  View calls →
                </span>
              </div>

              {c.totalCalls === 0 && (
                <p className="mt-2 text-[10px] italic text-gray-600">No calls recorded for this campaign yet.</p>
              )}

              {c.totalCalls > 0 && successRate === 0 && c.goalsReached === 0 && (
                <p className="mt-2 text-[10px] text-gray-600">No goals reached yet.</p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
