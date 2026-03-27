"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listConversations, deleteConversation, getTrackerItemByConversationId } from "@/lib/db";
import type { Conversation } from "@/lib/database.types";

const PAGE_SIZE = 20;

export default function ConversationsPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeAgent, setActiveAgent] = useState<string | null>(null); // null = All
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    listConversations()
      .then(setConversations)
      .catch((e) => { setLoadError(e?.message ?? "Failed to load conversations"); setConversations([]); })
      .finally(() => setLoading(false));
  }, []);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, activeAgent]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!window.confirm("Delete this conversation? This cannot be undone.")) return;
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // silent
    }
  }

  // Build unique agent list from conversations
  const agents = Array.from(
    new Map(
      conversations
        .filter((c) => c.assistant_id && c.assistant_name)
        .map((c) => [c.assistant_id!, c.assistant_name!])
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const filtered = conversations.filter((c) => {
    if (activeAgent && c.assistant_id !== activeAgent) return false;
    if (search.trim() && !c.title.toLowerCase().includes(search.toLowerCase())) return false;
    const created = new Date(c.created_at);
    if (dateFrom && created < new Date(dateFrom)) return false;
    if (dateTo && created > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col px-4 py-6 pb-[env(safe-area-inset-bottom)] sm:px-6 sm:py-8">
      {/* Header */}
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Conversations</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filtered.length} of {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
          </p>
        </div>
      </header>

      {/* Agent filter tabs */}
      {agents.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveAgent(null)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              activeAgent === null
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
            }`}
          >
            All
          </button>
          {agents.map(([id, name]) => (
            <button
              key={id}
              onClick={() => setActiveAgent(id === activeAgent ? null : id)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                activeAgent === id
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Search + date filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 py-2.5 pl-10 pr-4 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-gray-500 uppercase tracking-wider">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none [color-scheme:dark]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-gray-500 uppercase tracking-wider">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none [color-scheme:dark]"
          />
        </div>

        {(search || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }}
            className="self-end rounded-lg border border-gray-700 px-3 py-2.5 text-sm text-gray-400 transition hover:text-gray-200"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50 backdrop-blur overflow-hidden">
        {/* Table header */}
        {!loading && !loadError && filtered.length > 0 && (
          <div className="hidden sm:grid grid-cols-[1fr_160px_160px_40px] gap-4 border-b border-gray-700 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            <span>Date</span>
            <span>Tester</span>
            <span>Agent</span>
            <span />
          </div>
        )}

        {loading && <p className="px-5 py-10 text-center text-sm text-gray-500">Loading...</p>}
        {!loading && loadError && <p className="px-5 py-10 text-center text-sm text-red-400">{loadError}</p>}
        {!loading && !loadError && filtered.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-gray-500">
            {search || dateFrom || dateTo || activeAgent ? "No conversations match your filters." : "No saved conversations yet."}
          </p>
        )}

        {paginated.map((c) => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={async () => {
              const item = await getTrackerItemByConversationId(c.id);
              if (item) router.push(`/tracker/item/${item.id}`);
            }}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                const item = await getTrackerItemByConversationId(c.id);
                if (item) router.push(`/tracker/item/${item.id}`);
              }
            }}
            className="grid grid-cols-[1fr_40px] sm:grid-cols-[1fr_160px_160px_40px] gap-4 items-center border-b border-gray-700/50 px-5 py-3.5 cursor-pointer transition hover:bg-gray-700/30 active:bg-gray-700/40 last:border-b-0"
          >
            {/* Date */}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-200">
                {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
              <p className="text-xs text-gray-500">
                {new Date(c.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </p>
              {/* Mobile: show tester + agent below date */}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 sm:hidden">
                {c.tester && <span className="text-xs text-gray-400">{c.tester}</span>}
                {c.assistant_name && (
                  <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-400">
                    {c.assistant_name}
                  </span>
                )}
              </div>
            </div>

            {/* Tester (desktop) */}
            <div className="hidden sm:block min-w-0">
              <span className="truncate text-sm text-gray-300">{c.tester ?? "—"}</span>
            </div>

            {/* Agent (desktop) */}
            <div className="hidden sm:block min-w-0">
              {c.assistant_name ? (
                <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-400">
                  {c.assistant_name}
                </span>
              ) : (
                <span className="text-sm text-gray-600">—</span>
              )}
            </div>

            {/* Delete */}
            <div className="flex justify-end">
              <button
                onClick={(e) => handleDelete(e, c.id)}
                className="rounded p-1.5 text-gray-600 transition hover:bg-red-500/20 hover:text-red-400"
                title="Delete conversation"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500">
            Page {page} of {totalPages} &middot; {filtered.length} results
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 transition hover:text-gray-200 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 transition hover:text-gray-200 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
