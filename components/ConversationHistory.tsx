"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listConversations, deleteConversation } from "@/lib/db";
import type { Conversation } from "@/lib/database.types";

type Props = {
  onSelect: (id: string) => void;
  refreshKey: number;
  limit?: number;
};

export default function ConversationHistory({ onSelect, refreshKey, limit }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listConversations()
      .then(setConversations)
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // silent
    }
  }

  const displayed = limit ? conversations.slice(0, limit) : conversations;
  const hasMore = limit ? conversations.length > limit : false;

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 backdrop-blur">
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3 sm:px-5">
        <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wider sm:text-sm">
          Saved Conversations
        </h2>
        {hasMore && (
          <Link
            href="/conversations"
            className="text-xs font-medium text-indigo-400 transition hover:text-indigo-300"
          >
            View All ({conversations.length})
          </Link>
        )}
      </div>

      <div className="max-h-[250px] overflow-y-auto sm:max-h-[300px]">
        {loading && (
          <p className="px-5 py-4 text-sm text-gray-500">Loading...</p>
        )}

        {!loading && conversations.length === 0 && (
          <p className="px-5 py-4 text-sm text-gray-500">No saved conversations yet.</p>
        )}

        {displayed.map((c) => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(c.id)}
            onKeyDown={(e) => e.key === "Enter" && onSelect(c.id)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 border-b border-gray-700/50 px-4 py-3.5 text-left transition active:bg-gray-700/40 hover:bg-gray-700/30 last:border-b-0 sm:px-5 sm:py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-200">{c.title}</p>
              <p className="text-xs text-gray-500">
                {new Date(c.created_at).toLocaleString()}
              </p>
            </div>
            <button
              onClick={(e) => handleDelete(e, c.id)}
              className="shrink-0 rounded p-2 text-gray-500 transition active:bg-red-500/30 hover:bg-red-500/20 hover:text-red-400 sm:p-1"
              title="Delete conversation"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
