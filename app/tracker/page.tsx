"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getAllCommentsWithContext,
  getAllFeedbackWithContext,
  getAllTrackerItems,
  addTrackerItem,
  updateCommentStatus,
  updateFeedbackStatus,
  updateTrackerItemStatus,
  deleteTrackerItem,
  listConversations,
  getReplies,
  addReply,
  deleteReply,
} from "@/lib/db";
import type { CommentWithContext, FeedbackWithContext } from "@/lib/db";
import type { ItemStatus, Conversation, TrackerItem, TrackerReply } from "@/lib/database.types";
import { getNickname } from "@/components/Onboarding";

type UnifiedRow = {
  id: string;
  kind: "comment" | "feedback" | "item";
  author: string;
  content: string;
  status: ItemStatus;
  conversationTitle: string | null;
  conversationId: string | null;
  meta?: string;
  created_at: string;
};

const STATUS_OPTIONS: { value: ItemStatus; label: string; color: string; dot: string }[] = [
  { value: "open", label: "Open", color: "text-blue-400", dot: "bg-blue-400" },
  { value: "in_progress", label: "In Progress", color: "text-yellow-400", dot: "bg-yellow-400" },
  { value: "done", label: "Done", color: "text-emerald-400", dot: "bg-emerald-400" },
  { value: "has_question", label: "Has Question", color: "text-purple-400", dot: "bg-purple-400" },
];

function StatusDropdown({
  status,
  onChange,
}: {
  status: ItemStatus;
  onChange: (s: ItemStatus) => void;
}) {
  const opt = STATUS_OPTIONS.find((o) => o.value === status)!;

  return (
    <div className="relative inline-flex items-center">
      <span className={`absolute left-2.5 h-2 w-2 rounded-full ${opt.dot} pointer-events-none`} />
      <select
        value={status}
        onChange={(e) => onChange(e.target.value as ItemStatus)}
        className={`appearance-none rounded-lg border border-gray-600 bg-gray-700 py-1.5 pl-7 pr-7 text-xs font-medium ${opt.color} cursor-pointer focus:border-indigo-500 focus:outline-none`}
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="absolute right-2 h-3 w-3 text-gray-400 pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

function KindBadge({ kind }: { kind: UnifiedRow["kind"] }) {
  const styles = {
    comment: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    feedback: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    item: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  const labels = { comment: "Comment", feedback: "Feedback", item: "Comment" };

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[kind]}`}
    >
      {labels[kind]}
    </span>
  );
}

// --- Detail Modal ---

function DetailModal({
  row,
  onClose,
  onStatusChange,
  onDelete,
}: {
  row: UnifiedRow;
  onClose: () => void;
  onStatusChange: (s: ItemStatus) => void;
  onDelete: () => void;
}) {
  const [replies, setReplies] = useState<TrackerReply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(true);
  const [replyInput, setReplyInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setLoadingReplies(true);
    getReplies(row.kind, row.id)
      .then(setReplies)
      .catch(() => {})
      .finally(() => setLoadingReplies(false));
  }, [row.kind, row.id]);

  async function handleSendReply() {
    const trimmed = replyInput.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const r = await addReply(row.kind, row.id, trimmed, getNickname());
      setReplies((prev) => [...prev, r]);
      setReplyInput("");
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteReply(id: string) {
    try {
      await deleteReply(id);
      setReplies((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // silent
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85dvh] flex flex-col rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-700 p-4 sm:p-5">
          <div className="flex items-center gap-2 flex-wrap">
            <KindBadge kind={row.kind} />
            <StatusDropdown status={row.status} onChange={onStatusChange} />
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-gray-400 transition hover:bg-gray-800 hover:text-gray-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal body — scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 sm:p-5">
          {/* Main content */}
          <div>
            <p className="text-sm text-gray-200 whitespace-pre-wrap">{row.content}</p>
            {row.meta && (
              <p className="mt-2 text-xs text-gray-500">{row.meta}</p>
            )}
          </div>

          {/* Info row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>
              By <span className="font-medium text-indigo-400">{row.author}</span>
            </span>
            {row.conversationTitle && (
              <span>
                in <span className="text-gray-400">{row.conversationTitle}</span>
              </span>
            )}
            <span>{new Date(row.created_at).toLocaleString()}</span>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700" />

          {/* Replies thread */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Thread {replies.length > 0 && `(${replies.length})`}
            </h3>

            {loadingReplies ? (
              <p className="text-xs text-gray-500">Loading replies...</p>
            ) : replies.length === 0 ? (
              <p className="text-xs text-gray-500">No replies yet. Start the conversation below.</p>
            ) : (
              <div className="space-y-2">
                {replies.map((r) => (
                  <div key={r.id} className="rounded-lg bg-gray-800 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
                          {r.author}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {new Date(r.created_at).toLocaleString()}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteReply(r.id)}
                        className="text-[10px] text-gray-500 transition hover:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                    <p className="mt-1 text-sm text-gray-200 whitespace-pre-wrap">{r.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Reply input — sticky at bottom */}
        <div className="border-t border-gray-700 p-4 sm:p-5">
          <div className="flex gap-2">
            <input
              type="text"
              value={replyInput}
              onChange={(e) => setReplyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendReply();
                }
              }}
              placeholder="Write a reply..."
              className="min-w-0 flex-1 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none sm:py-2"
            />
            <button
              onClick={handleSendReply}
              disabled={sending || !replyInput.trim()}
              className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40 sm:py-2"
            >
              {sending ? "..." : "Reply"}
            </button>
          </div>

          {/* Delete item button */}
          {row.kind === "item" && (
            <button
              onClick={onDelete}
              className="mt-3 text-xs text-gray-500 transition hover:text-red-400"
            >
              Delete this comment
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main page ---

export default function TrackerPage() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ItemStatus | "all">("all");
  const [kindFilter, setKindFilter] = useState<UnifiedRow["kind"] | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState<UnifiedRow | null>(null);

  // Add new item form
  const [showForm, setShowForm] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newConvId, setNewConvId] = useState<string>("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [adding, setAdding] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [comments, feedbacks, items] = await Promise.all([
        getAllCommentsWithContext(),
        getAllFeedbackWithContext(),
        getAllTrackerItems(),
      ]);

      const unified: UnifiedRow[] = [
        ...comments.map(
          (c: CommentWithContext): UnifiedRow => ({
            id: c.id,
            kind: "comment",
            author: c.author,
            content: c.content,
            status: c.status,
            conversationTitle: c.conversation_title,
            conversationId: c.conversation_id,
            meta: `On ${c.message_role} message: "${c.message_content.slice(0, 80)}${c.message_content.length > 80 ? "..." : ""}"`,
            created_at: c.created_at,
          })
        ),
        ...feedbacks.map(
          (f: FeedbackWithContext): UnifiedRow => ({
            id: f.id,
            kind: "feedback",
            author: f.author,
            content: f.text_content || `Rating: ${f.rating}/5`,
            status: f.status,
            conversationTitle: f.conversation_title,
            conversationId: f.conversation_id,
            meta: f.rating ? `${f.rating}/5 stars` : undefined,
            created_at: f.created_at,
          })
        ),
        ...items.map(
          (t: TrackerItem & { conversation_title: string | null }): UnifiedRow => ({
            id: t.id,
            kind: "item",
            author: t.author,
            content: t.content,
            status: t.status,
            conversationTitle: t.conversation_title,
            conversationId: t.conversation_id,
            created_at: t.created_at,
          })
        ),
      ];

      unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRows(unified);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleStatusChange(row: UnifiedRow, newStatus: ItemStatus) {
    try {
      if (row.kind === "comment") await updateCommentStatus(row.id, newStatus);
      else if (row.kind === "feedback") await updateFeedbackStatus(row.id, newStatus);
      else await updateTrackerItemStatus(row.id, newStatus);

      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, status: newStatus } : r))
      );
      if (selectedRow?.id === row.id) {
        setSelectedRow((prev) => prev ? { ...prev, status: newStatus } : null);
      }
    } catch {
      // silent
    }
  }

  async function handleAddItem() {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      const item = await addTrackerItem(trimmed, getNickname(), newConvId || undefined);
      const convTitle = conversations.find((c) => c.id === newConvId)?.title ?? null;
      setRows((prev) => [
        {
          id: item.id,
          kind: "item",
          author: item.author,
          content: item.content,
          status: item.status,
          conversationTitle: convTitle,
          conversationId: item.conversation_id,
          created_at: item.created_at,
        },
        ...prev,
      ]);
      setNewContent("");
      setNewConvId("");
      setShowForm(false);
    } catch {
      // silent
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(row: UnifiedRow) {
    if (row.kind !== "item") return;
    try {
      await deleteTrackerItem(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      if (selectedRow?.id === row.id) setSelectedRow(null);
    } catch {
      // silent
    }
  }

  useEffect(() => {
    if (showForm && conversations.length === 0) {
      listConversations().then(setConversations).catch(() => {});
    }
  }, [showForm, conversations.length]);

  const filtered = rows.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (kindFilter !== "all" && r.kind !== kindFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.content.toLowerCase().includes(q) ||
        r.author.toLowerCase().includes(q) ||
        r.conversationTitle?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    all: rows.length,
    open: rows.filter((r) => r.status === "open").length,
    in_progress: rows.filter((r) => r.status === "in_progress").length,
    done: rows.filter((r) => r.status === "done").length,
    has_question: rows.filter((r) => r.status === "has_question").length,
  };

  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-3 py-6 pb-[env(safe-area-inset-bottom)] sm:px-6 sm:py-10">
      {/* Detail modal */}
      {selectedRow && (
        <DetailModal
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          onStatusChange={(s) => handleStatusChange(selectedRow, s)}
          onDelete={() => handleDelete(selectedRow)}
        />
      )}

      {/* Header */}
      <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Comment Tracker
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Track and resolve comments and feedback across all conversations
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

      {/* Stats row */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:grid-cols-5 sm:gap-3">
        {[
          { key: "all" as const, label: "Total", count: counts.all, color: "border-gray-600 text-gray-300" },
          { key: "open" as const, label: "Open", count: counts.open, color: "border-blue-500/30 text-blue-400" },
          { key: "in_progress" as const, label: "In Progress", count: counts.in_progress, color: "border-yellow-500/30 text-yellow-400" },
          { key: "done" as const, label: "Done", count: counts.done, color: "border-emerald-500/30 text-emerald-400" },
          { key: "has_question" as const, label: "Questions", count: counts.has_question, color: "border-purple-500/30 text-purple-400" },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setFilter(s.key)}
            className={`rounded-lg border p-2.5 text-center transition sm:p-3 ${
              filter === s.key ? `${s.color} bg-gray-800` : "border-gray-700 bg-gray-800/50 text-gray-500 hover:border-gray-600"
            }`}
          >
            <div className="text-lg font-bold sm:text-xl">{s.count}</div>
            <div className="text-[10px] uppercase tracking-wider sm:text-xs">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Filters + actions bar */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search comments..."
          className="min-w-0 flex-1 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as any)}
          className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-300 focus:border-indigo-500 focus:outline-none"
        >
          <option value="all">All Types</option>
          <option value="comment">Comments</option>
          <option value="feedback">Feedback</option>
          <option value="item">Comments (Manual)</option>
        </select>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 whitespace-nowrap"
        >
          + Add Comment
        </button>
      </div>

      {/* Add new item form */}
      {showForm && (
        <div className="mb-4 rounded-xl border border-gray-700 bg-gray-800/50 p-4 space-y-3">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Write a comment or training observation..."
            rows={2}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={newConvId}
              onChange={(e) => setNewConvId(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-300 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">No conversation (general comment)</option>
              {conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title.slice(0, 60)}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleAddItem}
                disabled={adding || !newContent.trim()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
              >
                {adding ? "Adding..." : "Add"}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setNewContent("");
                  setNewConvId("");
                }}
                className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-400 transition hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-20 text-center text-gray-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-gray-500">
          {rows.length === 0
            ? "No comments or feedback yet. Start by testing a conversation!"
            : "No results match your filters."}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-700">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800/80">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Type
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Content
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Conversation
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Author
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {filtered.map((row) => (
                  <tr
                    key={`${row.kind}-${row.id}`}
                    className="transition hover:bg-gray-800/50 cursor-pointer"
                    onClick={() => setSelectedRow(row)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <StatusDropdown
                        status={row.status}
                        onChange={(s) => handleStatusChange(row, s)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <KindBadge kind={row.kind} />
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <p className="text-gray-200 truncate">{row.content}</p>
                      {row.meta && (
                        <p className="mt-0.5 text-[11px] text-gray-500 truncate">{row.meta}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[160px] truncate">
                      {row.conversationTitle ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-indigo-400">{row.author}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(row.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {filtered.map((row) => (
              <div
                key={`${row.kind}-${row.id}`}
                className="rounded-xl border border-gray-700 bg-gray-800/50 p-3 space-y-2 cursor-pointer active:bg-gray-800"
                onClick={() => setSelectedRow(row)}
              >
                <div
                  className="flex items-center justify-between gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <StatusDropdown
                      status={row.status}
                      onChange={(s) => handleStatusChange(row, s)}
                    />
                    <KindBadge kind={row.kind} />
                  </div>
                </div>
                <p className="text-sm text-gray-200 line-clamp-2">{row.content}</p>
                {row.meta && (
                  <p className="text-[11px] text-gray-500 truncate">{row.meta}</p>
                )}
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>
                    <span className="text-indigo-400 font-medium">{row.author}</span>
                    {row.conversationTitle && (
                      <span className="ml-2">in {row.conversationTitle.slice(0, 30)}</span>
                    )}
                  </span>
                  <span>{new Date(row.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
