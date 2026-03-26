"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getCommentById,
  getFeedbackById,
  getTrackerItemById,
  getConversationWithMessages,
  getActivePrompt,
  getCommentsByConversation,
  getReplies,
  addReply,
  addComment,
  deleteReply,
  updateCommentStatus,
  updateFeedbackStatus,
  updateTrackerItemStatus,
  submitFeedback,
} from "@/lib/db";
import type {
  Comment,
  Conversation,
  Message,
  PromptLibraryItem,
  TrackerReply,
  ItemStatus,
} from "@/lib/database.types";
import { getNickname } from "@/components/Onboarding";
import CallRecording from "@/components/CallRecording";

const STATUS_OPTIONS: { value: ItemStatus; label: string; color: string; dot: string }[] = [
  { value: "open", label: "Open", color: "text-blue-400", dot: "bg-blue-400" },
  { value: "in_progress", label: "In Progress", color: "text-yellow-400", dot: "bg-yellow-400" },
  { value: "done", label: "Done", color: "text-emerald-400", dot: "bg-emerald-400" },
  { value: "has_question", label: "Has Question", color: "text-purple-400", dot: "bg-purple-400" },
];

function StatusDropdown({ status, onChange }: { status: ItemStatus; onChange: (s: ItemStatus) => void }) {
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
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <svg className="absolute right-2 h-3 w-3 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

type ThreadMode = { type: "item" } | { type: "message"; messageId: string };

export default function TrackerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const kind = params.kind as "comment" | "feedback" | "item";
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Core data
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activePrompt, setActivePrompt] = useState<PromptLibraryItem | null>(null);
  const [convComments, setConvComments] = useState<Comment[]>([]);

  // Original item
  const [itemAuthor, setItemAuthor] = useState("");
  const [itemContent, setItemContent] = useState("");
  const [itemStatus, setItemStatus] = useState<ItemStatus>("open");
  const [itemMessageId, setItemMessageId] = useState<string | null>(null);

  // Star rating (saves on click, no fetch on load)
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [ratingSaved, setRatingSaved] = useState(false);

  // Thread panel
  const [threadMode, setThreadMode] = useState<ThreadMode>({ type: "item" });
  const [replies, setReplies] = useState<TrackerReply[]>([]);
  const [msgComments, setMsgComments] = useState<Comment[]>([]);
  const [replyInput, setReplyInput] = useState("");
  const [sending, setSending] = useState(false);

  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let conversationId: string | null = null;

        if (kind === "comment") {
          const comment = await getCommentById(id);
          setItemAuthor(comment.author);
          setItemContent(comment.content);
          setItemStatus(comment.status);
          setItemMessageId(comment.message_id);
          conversationId = comment.conversation_id;
        } else if (kind === "feedback") {
          const feedback = await getFeedbackById(id);
          setItemAuthor(feedback.author);
          setItemContent(feedback.text_content ?? `Rating: ${feedback.rating}/5`);
          setItemStatus(feedback.status);
          conversationId = feedback.conversation_id;
        } else {
          const item = await getTrackerItemById(id);
          setItemAuthor(item.author);
          setItemContent(item.content);
          setItemStatus(item.status);
          conversationId = item.conversation_id;
        }

        const [promptResult, repliesResult] = await Promise.all([
          getActivePrompt(),
          getReplies(kind, id),
        ]);
        setActivePrompt(promptResult);
        setReplies(repliesResult);

        if (conversationId) {
          const [convData, commentsData] = await Promise.all([
            getConversationWithMessages(conversationId),
            getCommentsByConversation(conversationId),
          ]);
          setConversation(convData.conversation);
          setMessages(convData.messages);
          setConvComments(commentsData);
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [kind, id]);

  // Auto-scroll to highlighted message after load
  useEffect(() => {
    if (!loading && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [loading]);

  function handleMessageClick(messageId: string) {
    setThreadMode({ type: "message", messageId });
    setMsgComments(convComments.filter((c) => c.message_id === messageId));
    setReplyInput("");
  }

  async function handleStatusChange(newStatus: ItemStatus) {
    setItemStatus(newStatus);
    try {
      if (kind === "comment") await updateCommentStatus(id, newStatus);
      else if (kind === "feedback") await updateFeedbackStatus(id, newStatus);
      else await updateTrackerItemStatus(id, newStatus);
    } catch { /* silent */ }
  }

  async function handleSend() {
    const trimmed = replyInput.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      if (threadMode.type === "item") {
        const r = await addReply(kind, id, trimmed, getNickname());
        setReplies((prev) => [...prev, r]);
      } else {
        const c = await addComment(threadMode.messageId, trimmed, getNickname());
        setMsgComments((prev) => [...prev, c]);
        setConvComments((prev) => [...prev, c]);
      }
      setReplyInput("");
    } catch { /* silent */ } finally {
      setSending(false);
    }
  }

  async function handleRate(stars: number) {
    setRating(stars);
    setRatingSaved(false);
    try {
      if (conversation) {
        await submitFeedback(conversation.id, getNickname(), stars, null, null);
      }
      setRatingSaved(true);
    } catch { /* silent */ }
  }

  async function handleDeleteReply(replyId: string) {
    try {
      await deleteReply(replyId);
      setReplies((prev) => prev.filter((r) => r.id !== replyId));
    } catch { /* silent */ }
  }

  const kindLabel = kind === "feedback" ? "Feedback" : kind === "item" ? "Conversation" : "Comment";

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-950 text-gray-500">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-gray-950 text-gray-400">
        <p className="text-red-400">{error}</p>
        <Link href="/tracker" className="text-sm text-indigo-400 hover:underline">← Back to Tracker</Link>
      </div>
    );
  }

  const threadIsItem = threadMode.type === "item";
  const selectedMsgId = threadMode.type === "message" ? threadMode.messageId : null;

  return (
    <div className="flex h-full flex-col bg-gray-950 text-white">
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-800 px-4 py-3 sm:px-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-300 transition hover:bg-gray-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="flex flex-1 flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-base font-bold tracking-tight text-white">
            {conversation?.title ?? kindLabel}
          </h1>
          {conversation && (
            <span className="text-xs text-gray-500">
              {new Date(conversation.created_at).toLocaleString()}
            </span>
          )}
          <span className="text-xs text-indigo-400 font-medium">{itemAuthor}</span>
        </div>
      </header>

      {/* 3-column body */}
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">

        {/* Col 1 — System Prompt */}
        <div className="hidden lg:flex lg:w-[30%] shrink-0 flex-col border-r border-gray-800">
          <div className="border-b border-gray-800 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">System Prompt</p>
            {activePrompt && (
              <p className="mt-0.5 truncate text-[11px] text-emerald-400">{activePrompt.name} · Active</p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {activePrompt ? (
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-300">
                {activePrompt.content}
              </pre>
            ) : (
              <div className="space-y-2 text-xs text-gray-500">
                <p>No active prompt.</p>
                <Link href="/prompts" className="text-indigo-400 hover:underline">Set one in Prompt Library →</Link>
              </div>
            )}
          </div>
        </div>

        {/* Col 2 — Recording + Transcript */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-gray-800">
          {/* Recording bar */}
          {conversation?.vapi_call_id && (
            <div className="shrink-0 border-b border-gray-800 px-4 py-3">
              <CallRecording vapiCallId={conversation.vapi_call_id} />
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-600">No transcript available</p>
            )}
            {messages.map((msg) => {
              const isHighlighted = msg.id === itemMessageId;
              const isSelected = msg.id === selectedMsgId;
              const commentCount = convComments.filter((c) => c.message_id === msg.id).length;
              const isUser = msg.role === "user";

              return (
                <div
                  key={msg.id}
                  ref={isHighlighted ? highlightRef : null}
                  onClick={() => handleMessageClick(msg.id)}
                  className={`flex cursor-pointer ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[80%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
                    {/* Name label */}
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1 ${
                      isUser ? "text-right text-indigo-400" : "text-left text-gray-400"
                    }`}>
                      {isUser ? "User" : "Agent"}
                    </span>

                    {/* Bubble */}
                    <div className={`relative rounded-2xl px-4 py-2.5 transition-all ${
                      isHighlighted
                        ? "border-2 border-amber-500/70 bg-amber-950/60 ring-2 ring-amber-500/20 shadow-amber-900/30 shadow-lg"
                        : isSelected
                        ? isUser
                          ? "bg-indigo-600/70 ring-1 ring-indigo-400/50"
                          : "bg-gray-600/60 ring-1 ring-indigo-400/50"
                        : isUser
                        ? "bg-indigo-600 hover:bg-indigo-500"
                        : "bg-gray-700 hover:bg-gray-600"
                    } ${isUser ? "rounded-tr-sm" : "rounded-tl-sm"}`}>
                      <p className="text-sm leading-relaxed text-white whitespace-pre-wrap">{msg.content}</p>
                    </div>

                    {/* Badges row */}
                    {(isHighlighted || commentCount > 0) && (
                      <div className={`flex gap-1.5 px-1 ${isUser ? "justify-end" : "justify-start"}`}>
                        {isHighlighted && (
                          <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-400">
                            Commented here
                          </span>
                        )}
                        {commentCount > 0 && (
                          <span className="rounded-full bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-[9px] font-medium text-indigo-400">
                            {commentCount} {commentCount === 1 ? "comment" : "comments"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Col 3 — Thread */}
        <div className="flex w-full shrink-0 flex-col border-t border-gray-800 lg:w-80 xl:w-96 lg:border-t-0">
          {/* Status + rating + thread header */}
          <div className="shrink-0 border-b border-gray-800 px-4 py-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <StatusDropdown status={itemStatus} onChange={handleStatusChange} />
              {!threadIsItem && (
                <button
                  onClick={() => { setThreadMode({ type: "item" }); setReplyInput(""); }}
                  className="text-xs text-gray-400 hover:text-gray-200 transition"
                >
                  ← Back to {kindLabel}
                </button>
              )}
            </div>

            {/* Star rating */}
            {conversation && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Rating</span>
                <div
                  className="flex gap-0.5"
                  onMouseLeave={() => setHoverRating(0)}
                >
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      onClick={() => handleRate(s)}
                      onMouseEnter={() => setHoverRating(s)}
                      className="transition hover:scale-110"
                    >
                      <svg
                        className={`h-5 w-5 transition-colors ${s <= (hoverRating || rating) ? "text-yellow-400" : "text-gray-600"}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </button>
                  ))}
                </div>
                {ratingSaved && (
                  <span className="text-[10px] text-emerald-400">Saved</span>
                )}
              </div>
            )}

            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              {threadIsItem ? kindLabel : "Message Thread"}
            </p>
          </div>

          {/* Original item content (only in item mode) */}
          {threadIsItem && (
            <div className="shrink-0 border-b border-gray-700/50 bg-gray-800/30 px-4 py-3">
              <p className="text-sm text-gray-200 whitespace-pre-wrap">{itemContent}</p>
              <p className="mt-1.5 text-[11px] text-gray-500">
                By <span className="text-indigo-400 font-medium">{itemAuthor}</span>
              </p>
            </div>
          )}

          {/* Message content in message mode */}
          {!threadIsItem && selectedMsgId && (
            <div className="shrink-0 border-b border-gray-700/50 bg-gray-800/30 px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">Message</p>
              <p className="text-sm text-gray-300 whitespace-pre-wrap line-clamp-3">
                {messages.find((m) => m.id === selectedMsgId)?.content}
              </p>
            </div>
          )}

          {/* Thread replies / comments */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {threadIsItem ? (
              replies.length === 0 ? (
                <p className="text-xs text-gray-600">No replies yet.</p>
              ) : (
                replies.map((r) => (
                  <div key={r.id} className="rounded-lg bg-gray-800 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">{r.author}</span>
                        <span className="text-[10px] text-gray-500">{new Date(r.created_at).toLocaleString()}</span>
                      </div>
                      <button onClick={() => handleDeleteReply(r.id)} className="text-[10px] text-gray-600 hover:text-red-400 transition">
                        Delete
                      </button>
                    </div>
                    <p className="text-sm text-gray-200 whitespace-pre-wrap">{r.content}</p>
                  </div>
                ))
              )
            ) : (
              msgComments.length === 0 ? (
                <p className="text-xs text-gray-600">No comments on this message yet.</p>
              ) : (
                msgComments.map((c) => (
                  <div key={c.id} className="rounded-lg bg-gray-800 px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">{c.author}</span>
                      <span className="text-[10px] text-gray-500">{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-gray-200 whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))
              )
            )}
          </div>

          {/* Reply input */}
          <div className="shrink-0 border-t border-gray-800 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={threadIsItem ? "Write a reply..." : "Add a comment on this message..."}
                className="min-w-0 flex-1 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              />
              <button
                onClick={handleSend}
                disabled={sending || !replyInput.trim()}
                className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
