"use client";

import { useEffect, useState } from "react";
import { getCommentsForMessage, addComment, deleteComment } from "@/lib/db";
import { getNickname } from "./Onboarding";
import type { Comment } from "@/lib/database.types";

type Props = {
  messageId: string;
};

function CommentItem({
  comment,
  allComments,
  onReply,
  onDelete,
}: {
  comment: Comment;
  allComments: Comment[];
  onReply: (parentId: string) => void;
  onDelete: (id: string) => void;
}) {
  const replies = allComments.filter((c) => c.parent_id === comment.id);

  return (
    <div className="space-y-2">
      <div className="rounded-lg bg-gray-700/50 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
            {comment.author}
          </span>
          <span className="text-[10px] text-gray-500">
            {new Date(comment.created_at).toLocaleTimeString()}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-200">{comment.content}</p>
        <div className="mt-1.5 flex gap-3">
          <button
            onClick={() => onReply(comment.id)}
            className="text-[11px] text-gray-400 transition hover:text-indigo-400"
          >
            Reply
          </button>
          <button
            onClick={() => onDelete(comment.id)}
            className="text-[11px] text-gray-400 transition hover:text-red-400"
          >
            Delete
          </button>
        </div>
      </div>

      {replies.length > 0 && (
        <div className="ml-4 space-y-2 border-l border-gray-600 pl-3">
          {replies.map((r) => (
            <CommentItem
              key={r.id}
              comment={r}
              allComments={allComments}
              onReply={onReply}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentThread({ messageId }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getCommentsForMessage(messageId)
      .then(setComments)
      .catch(() => {});
  }, [messageId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      const newComment = await addComment(messageId, trimmed, getNickname(), replyTo ?? undefined);
      setComments((prev) => [...prev, newComment]);
      setInput("");
      setReplyTo(null);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id && c.parent_id !== id));
    } catch {
      // silent
    }
  }

  const topLevel = comments.filter((c) => !c.parent_id);

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-gray-600/50 bg-gray-800/80 p-3">
      {topLevel.length > 0 && (
        <div className="space-y-2">
          {topLevel.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              allComments={comments}
              onReply={(parentId) => setReplyTo(parentId)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        {replyTo && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Replying to thread</span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="text-red-400 hover:text-red-300"
            >
              Cancel
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add a comment..."
            className="min-w-0 flex-1 rounded-md border border-gray-600 bg-gray-700 px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none sm:py-1.5 sm:text-xs"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="shrink-0 rounded-md bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white transition active:scale-[0.97] hover:bg-indigo-500 disabled:opacity-40 sm:py-1.5 sm:text-xs"
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
