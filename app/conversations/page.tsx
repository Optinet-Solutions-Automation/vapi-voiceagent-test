"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listConversations,
  getTrackerItemByConversationId,
  updateConversationTitle,
  setConversationFavorite,
} from "@/lib/db";
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
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [page, setPage] = useState(1);

  // Inline title editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    listConversations()
      .then(setConversations)
      .catch((e) => { setLoadError(e?.message ?? "Failed to load conversations"); setConversations([]); })
      .finally(() => setLoading(false));
  }, []);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, activeAgent, favoritesOnly]);

  const agents = Array.from(
    new Map(
      conversations
        .filter((c) => c.assistant_id && c.assistant_name)
        .map((c) => [c.assistant_id!, c.assistant_name!])
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const filtered = conversations.filter((c) => {
    if (favoritesOnly && !c.is_favorite) return false;
    if (activeAgent && c.assistant_id !== activeAgent) return false;
    if (search.trim() && !c.title.toLowerCase().includes(search.toLowerCase())) return false;
    const created = new Date(c.created_at);
    if (dateFrom && created < new Date(dateFrom)) return false;
    if (dateTo && created > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleRowClick(c: Conversation) {
    const item = await getTrackerItemByConversationId(c.id);
    if (item) router.push(`/tracker/item/${item.id}`);
  }

  async function handleToggleFavorite(e: React.MouseEvent, c: Conversation) {
    e.stopPropagation();
    const next = !c.is_favorite;
    setConversations((prev) => prev.map((x) => x.id === c.id ? { ...x, is_favorite: next } : x));
    try {
      await setConversationFavorite(c.id, next);
    } catch {
      // Revert on failure
      setConversations((prev) => prev.map((x) => x.id === c.id ? { ...x, is_favorite: c.is_favorite } : x));
    }
  }

  function startEditing(e: React.MouseEvent, c: Conversation) {
    e.stopPropagation();
    setEditingId(c.id);
    setEditingTitle(c.title);
  }

  async function commitEdit(id: string) {
    const trimmed = editingTitle.trim();
    setEditingId(null);
    if (!trimmed) return;
    const prev = conversations.find((c) => c.id === id)?.title ?? "";
    if (trimmed === prev) return;
    setConversations((cs) => cs.map((c) => c.id === id ? { ...c, title: trimmed } : c));
    try {
      await updateConversationTitle(id, trimmed);
    } catch {
      setConversations((cs) => cs.map((c) => c.id === id ? { ...c, title: prev } : c));
    }
  }

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

      {/* Filter tabs: Favorites + Agents */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition ${
            favoritesOnly
              ? "bg-rose-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
          }`}
        >
          <svg className="h-3.5 w-3.5" fill={favoritesOnly ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          Favorites
        </button>

        {agents.length > 0 && (
          <>
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
          </>
        )}
      </div>

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
          <div className="hidden sm:grid grid-cols-[auto_1fr_160px_160px] gap-4 border-b border-gray-700 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            <span className="w-5" />
            <span>Title / Date</span>
            <span>Tester</span>
            <span>Agent</span>
          </div>
        )}

        {loading && <p className="px-5 py-10 text-center text-sm text-gray-500">Loading...</p>}
        {!loading && loadError && <p className="px-5 py-10 text-center text-sm text-red-400">{loadError}</p>}
        {!loading && !loadError && filtered.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-gray-500">
            {favoritesOnly ? "No favorite conversations yet." : search || dateFrom || dateTo || activeAgent ? "No conversations match your filters." : "No saved conversations yet."}
          </p>
        )}

        {paginated.map((c) => (
          <div
            key={c.id}
            onClick={() => editingId !== c.id && handleRowClick(c)}
            className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_160px_160px] gap-4 items-center border-b border-gray-700/50 px-5 py-3.5 cursor-pointer transition hover:bg-gray-700/30 active:bg-gray-700/40 last:border-b-0"
          >
            {/* Heart button */}
            <button
              onClick={(e) => handleToggleFavorite(e, c)}
              title={c.is_favorite ? "Remove from favorites" : "Mark as favorite"}
              className={`shrink-0 transition ${c.is_favorite ? "text-rose-500 hover:text-rose-400" : "text-gray-600 hover:text-rose-400"}`}
            >
              <svg className="h-4 w-4" fill={c.is_favorite ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>

            {/* Title + date */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 group">
                {editingId === c.id ? (
                  <input
                    ref={editInputRef}
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => commitEdit(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit(c.id);
                      if (e.key === "Escape") setEditingId(null);
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 rounded border border-indigo-500 bg-gray-800 px-2 py-0.5 text-sm font-medium text-gray-200 focus:outline-none"
                  />
                ) : (
                  <>
                    <p className="truncate text-sm font-medium text-gray-200">{c.title}</p>
                    <button
                      onClick={(e) => startEditing(e, c)}
                      title="Rename"
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-gray-300 transition"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
              <p className="text-xs text-gray-500">
                {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {" · "}
                {new Date(c.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </p>
              {/* Mobile: tester + agent */}
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
