"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type CallSummary = {
  id: string;
  type: string | null;
  status: string | null;
  endedReason: string | null;
  assistantId: string | null;
  assistantName: string | null;
  phoneNumber: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  cost: number | null;
  hasRecording: boolean;
  campaignId: string | null;
  campaignName: string | null;
};

type TranscriptEntry = {
  role: "user" | "agent";
  content: string;
  time: number | null;
  secondsFromStart: number | null;
};

type CallDetail = CallSummary & {
  summary: string | null;
  transcriptText: string | null;
  transcript: TranscriptEntry[];
  recordingUrl: string | null;
  stereoRecordingUrl: string | null;
};

const PAGE_SIZE = 25;

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatCost(cost: number | null): string {
  if (cost == null) return "—";
  return `$${cost.toFixed(4)}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    + " · "
    + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function VapiLogsPage() {
  return (
    <Suspense fallback={<div className="px-4 py-10 text-sm text-gray-500 sm:px-6">Loading...</div>}>
      <VapiLogsInner />
    </Suspense>
  );
}

function VapiLogsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCampaign = searchParams.get("campaign");

  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [activeCampaign, setActiveCampaign] = useState<string | null>(initialCampaign);
  const [page, setPage] = useState(1);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CallDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function loadCalls() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/vapi-calls?limit=100");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load calls");
      setCalls(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setLoadError(e?.message ?? "Failed to load calls");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCalls(); }, []);
  useEffect(() => { setPage(1); }, [search, activeAgent, activeStatus, activeCampaign]);

  // Keep the URL in sync so /campaigns deep-links work and the filter survives refresh.
  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (activeCampaign) params.set("campaign", activeCampaign);
    else params.delete("campaign");
    const qs = params.toString();
    router.replace(qs ? `/vapi-logs?${qs}` : "/vapi-logs", { scroll: false });
  }, [activeCampaign]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    fetch(`/api/vapi-call/${selectedId}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? "Failed to load call");
        return j as CallDetail;
      })
      .then(setDetail)
      .catch((e) => setDetailError(e?.message ?? "Failed to load call"))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const agents = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of calls) {
      if (c.assistantId) m.set(c.assistantId, c.assistantName ?? c.assistantId.slice(0, 8));
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [calls]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const c of calls) if (c.status) set.add(c.status);
    return Array.from(set).sort();
  }, [calls]);

  const campaigns = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of calls) {
      if (c.campaignId) m.set(c.campaignId, c.campaignName ?? c.campaignId.slice(0, 8));
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [calls]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return calls.filter((c) => {
      if (activeAgent && c.assistantId !== activeAgent) return false;
      if (activeStatus && c.status !== activeStatus) return false;
      if (activeCampaign && c.campaignId !== activeCampaign) return false;
      if (q) {
        const hay = `${c.assistantName ?? ""} ${c.campaignName ?? ""} ${c.phoneNumber ?? ""} ${c.id} ${c.endedReason ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [calls, search, activeAgent, activeStatus, activeCampaign]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col px-4 py-6 pb-[env(safe-area-inset-bottom)] sm:px-6 sm:py-8">
      {/* Header */}
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">VAPI Call Logs</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filtered.length} of {calls.length} call{calls.length !== 1 ? "s" : ""} from VAPI
          </p>
        </div>
        <button
          onClick={loadCalls}
          disabled={loading}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium text-gray-300 transition hover:bg-gray-800 disabled:opacity-40"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {/* Filters */}
      {campaigns.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-gray-500">Campaign</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCampaign(null)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                activeCampaign === null ? "bg-fuchsia-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              }`}
            >
              All Campaigns
            </button>
            {campaigns.map(([id, name]) => (
              <button
                key={id}
                onClick={() => setActiveCampaign(id === activeCampaign ? null : id)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                  activeCampaign === id ? "bg-fuchsia-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <p className="mb-1.5 text-[11px] uppercase tracking-wider text-gray-500">Agent</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveAgent(null)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              activeAgent === null ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
            }`}
          >
            All Agents
          </button>
          {agents.map(([id, name]) => (
            <button
              key={id}
              onClick={() => setActiveAgent(id === activeAgent ? null : id)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                activeAgent === id ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {statuses.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveStatus(null)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
              activeStatus === null ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-500 hover:text-gray-300"
            }`}
          >
            All Statuses
          </button>
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setActiveStatus(s === activeStatus ? null : s)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                activeStatus === s ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-500 hover:text-gray-300"
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
          placeholder="Search by agent, phone, call ID, ended reason..."
          className="w-full rounded-lg border border-gray-700 bg-gray-800/50 py-2.5 pl-10 pr-4 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50 backdrop-blur overflow-hidden">
        {!loading && !loadError && filtered.length > 0 && (
          <div className="hidden md:grid grid-cols-[170px_1fr_140px_90px_90px_90px] gap-4 border-b border-gray-700 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            <span>Started</span>
            <span>Agent / Caller</span>
            <span>Status</span>
            <span>Duration</span>
            <span>Cost</span>
            <span>Recording</span>
          </div>
        )}

        {loading && <p className="px-5 py-10 text-center text-sm text-gray-500">Loading calls...</p>}
        {!loading && loadError && <p className="px-5 py-10 text-center text-sm text-red-400">{loadError}</p>}
        {!loading && !loadError && filtered.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-gray-500">
            {calls.length === 0 ? "No calls found in your VAPI account." : "No calls match your filters."}
          </p>
        )}

        {paginated.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className="grid w-full grid-cols-[1fr_90px] md:grid-cols-[170px_1fr_140px_90px_90px_90px] gap-4 items-center border-b border-gray-700/50 px-5 py-3.5 text-left transition hover:bg-gray-700/30 last:border-b-0"
          >
            {/* Started — desktop col 1 */}
            <div className="hidden md:block min-w-0">
              <p className="text-sm text-gray-300">{formatDateTime(c.startedAt)}</p>
              <p className="truncate text-[11px] text-gray-600">{c.id.slice(0, 8)}…</p>
            </div>

            {/* Agent / Caller — col 2 (desktop) or col 1 (mobile) */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {c.assistantName ? (
                  <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-400">
                    {c.assistantName}
                  </span>
                ) : c.assistantId ? (
                  <span className="inline-flex items-center rounded-full bg-gray-700 px-2 py-0.5 font-mono text-[11px] text-gray-400" title={c.assistantId}>
                    Agent {c.assistantId.slice(0, 8)}
                  </span>
                ) : (
                  <span className="text-xs text-gray-600">No agent</span>
                )}
                {c.type && (
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">{c.type}</span>
                )}
              </div>
              <p className="mt-0.5 truncate text-sm text-gray-300">
                {c.phoneNumber ?? <span className="text-gray-500">Web call</span>}
              </p>
              {c.campaignName && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-medium text-fuchsia-400">
                  <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 13.5V20a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6.5l-9 5.25L3 13.5zM21 7.5L12 13 3 7.5V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v1.5z" />
                  </svg>
                  {c.campaignName}
                </span>
              )}
              <p className="mt-0.5 text-[11px] text-gray-500 md:hidden">{formatDateTime(c.startedAt)}</p>
            </div>

            {/* Status — desktop only */}
            <div className="hidden md:flex flex-col gap-0.5 min-w-0">
              {c.status && (
                <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  c.status === "ended" ? "bg-gray-700 text-gray-300"
                  : c.status === "in-progress" || c.status === "ringing" ? "bg-amber-500/20 text-amber-400"
                  : "bg-gray-700 text-gray-400"
                }`}>
                  {c.status}
                </span>
              )}
              {c.endedReason && (
                <span className="truncate text-[10px] text-gray-500">{c.endedReason}</span>
              )}
            </div>

            {/* Duration — desktop only */}
            <span className="hidden md:block text-sm text-gray-300">{formatDuration(c.durationSeconds)}</span>

            {/* Cost — desktop only */}
            <span className="hidden md:block text-sm text-gray-400">{formatCost(c.cost)}</span>

            {/* Recording indicator — visible on all */}
            <span className="text-right md:text-left">
              {c.hasRecording ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Audio
                </span>
              ) : (
                <span className="text-xs text-gray-600">—</span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500">Page {page} of {totalPages} · {filtered.length} results</p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 transition hover:text-gray-200 disabled:opacity-40">
              Previous
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 transition hover:text-gray-200 disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {selectedId && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedId(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex h-full w-full max-w-2xl flex-col border-l border-gray-700 bg-gray-900 shadow-2xl"
          >
            {/* Drawer header */}
            <div className="shrink-0 flex items-start justify-between gap-4 border-b border-gray-800 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-white">Call Details</h2>
                <p className="truncate text-xs text-gray-500">{selectedId}</p>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="shrink-0 rounded p-1 text-gray-400 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {detailLoading && <p className="py-10 text-center text-sm text-gray-500">Loading call details...</p>}
              {detailError && <p className="py-10 text-center text-sm text-red-400">{detailError}</p>}

              {detail && (
                <>
                  {detail.campaignName && (
                    <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-sm">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-400">Campaign</p>
                      <p className="mt-0.5 text-fuchsia-100">{detail.campaignName}</p>
                    </div>
                  )}

                  {/* Meta grid */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-500">Agent</p>
                      <p className="text-gray-200">{detail.assistantName ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-500">Caller</p>
                      <p className="text-gray-200">{detail.phoneNumber ?? "Web"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-500">Started</p>
                      <p className="text-gray-200">{formatDateTime(detail.startedAt)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-500">Ended</p>
                      <p className="text-gray-200">{formatDateTime(detail.endedAt)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-500">Duration</p>
                      <p className="text-gray-200">{formatDuration(detail.durationSeconds)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-500">Cost</p>
                      <p className="text-gray-200">{formatCost(detail.cost)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-500">Status</p>
                      <p className="text-gray-200">{detail.status ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-500">Ended Reason</p>
                      <p className="text-gray-200">{detail.endedReason ?? "—"}</p>
                    </div>
                  </div>

                  {/* Recording */}
                  {(detail.stereoRecordingUrl || detail.recordingUrl) ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Recording</p>
                      <audio
                        src={detail.stereoRecordingUrl ?? detail.recordingUrl ?? undefined}
                        controls
                        className="w-full"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">No recording available for this call.</p>
                  )}

                  {/* Summary */}
                  {detail.summary && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Summary</p>
                      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3 text-sm text-gray-300">
                        {detail.summary}
                      </div>
                    </div>
                  )}

                  {/* Transcript */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Transcript</p>
                    {detail.transcript.length === 0 ? (
                      detail.transcriptText ? (
                        <pre className="whitespace-pre-wrap rounded-lg border border-gray-700 bg-gray-800/50 p-3 font-mono text-xs text-gray-300">
                          {detail.transcriptText}
                        </pre>
                      ) : (
                        <p className="text-xs text-gray-500">No transcript available.</p>
                      )
                    ) : (
                      <div className="space-y-2.5">
                        {detail.transcript.map((m, i) => (
                          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
                              m.role === "user" ? "bg-indigo-600 text-white" : "bg-gray-700 text-gray-100"
                            }`}>
                              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-70">
                                {m.role === "user" ? "Caller" : "Agent"}
                              </div>
                              <p className="text-sm leading-relaxed">{m.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
