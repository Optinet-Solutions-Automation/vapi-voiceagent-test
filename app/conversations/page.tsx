"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listConversations, deleteConversation, getConversationWithMessages } from "@/lib/db";
import type { Conversation, Message } from "@/lib/database.types";
import type { TranscriptMessage } from "@/lib/types";
import TranscriptPanel from "@/components/TranscriptPanel";
import FeedbackPanel from "@/components/FeedbackPanel";
import CallRecording from "@/components/CallRecording";

type DisplayMessage = TranscriptMessage & { id?: string };

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Viewing state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewingTitle, setViewingTitle] = useState<string | null>(null);
  const [viewingCallId, setViewingCallId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loadingConvo, setLoadingConvo] = useState(false);

  useEffect(() => {
    setLoading(true);
    listConversations()
      .then(setConversations)
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleSelect(id: string) {
    setLoadingConvo(true);
    try {
      const { conversation, messages: dbMessages } = await getConversationWithMessages(id);
      setSelectedId(id);
      setViewingTitle(conversation.title);
      setViewingCallId(conversation.vapi_call_id);
      setMessages(
        dbMessages.map((m: Message) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at),
        }))
      );
    } catch {
      // silent
    } finally {
      setLoadingConvo(false);
    }
  }

  function handleBack() {
    setSelectedId(null);
    setViewingTitle(null);
    setViewingCallId(null);
    setMessages([]);
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) handleBack();
    } catch {
      // silent
    }
  }

  const filtered = search.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  // Viewing a conversation
  if (selectedId) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-3 py-6 pb-[env(safe-area-inset-bottom)] sm:gap-6 sm:px-4 sm:py-10">
        <header>
          <button
            onClick={handleBack}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-gray-200"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Conversations
          </button>
          <h1 className="text-lg font-bold text-white sm:text-xl">{viewingTitle}</h1>
        </header>

        {loadingConvo ? (
          <p className="text-sm text-gray-500">Loading conversation...</p>
        ) : (
          <>
            <TranscriptPanel
              messages={messages}
              title={`Review: ${viewingTitle}`}
              emptyText="This conversation has no messages."
            />

            {viewingCallId && (
              <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 backdrop-blur sm:p-5">
                <CallRecording vapiCallId={viewingCallId} />
              </div>
            )}

            <FeedbackPanel conversationId={selectedId} />
          </>
        )}
      </div>
    );
  }

  // Conversation list
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 px-3 py-6 pb-[env(safe-area-inset-bottom)] sm:gap-6 sm:px-4 sm:py-10">
      <header>
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-gray-200"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Console
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
          All Conversations
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {conversations.length} saved conversation{conversations.length !== 1 ? "s" : ""}
        </p>
      </header>

      {/* Search */}
      <div className="relative">
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

      {/* List */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50 backdrop-blur">
        {loading && (
          <p className="px-5 py-8 text-center text-sm text-gray-500">Loading...</p>
        )}

        {!loading && filtered.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-gray-500">
            {search.trim() ? "No conversations match your search." : "No saved conversations yet."}
          </p>
        )}

        {filtered.map((c) => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => handleSelect(c.id)}
            onKeyDown={(e) => e.key === "Enter" && handleSelect(c.id)}
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
