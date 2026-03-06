"use client";

import { useEffect, useState } from "react";
import { submitFeedback, getFeedbackForConversation } from "@/lib/db";
import { getNickname } from "./Onboarding";
import type { Feedback } from "@/lib/database.types";

type Props = {
  conversationId: string;
};

export default function FeedbackPanel({ conversationId }: Props) {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [text, setText] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    getFeedbackForConversation(conversationId)
      .then(setFeedbacks)
      .catch(() => {});
  }, [conversationId]);

  async function handleSubmit() {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      const fb = await submitFeedback(
        conversationId,
        getNickname(),
        rating,
        text.trim() || null,
        null
      );
      setFeedbacks((prev) => [...prev, fb]);
      setSubmitted(true);
      setText("");
      setRating(0);
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 backdrop-blur">
      <div className="border-b border-gray-700 px-4 py-3 sm:px-5">
        <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wider sm:text-sm">
          Feedback
        </h2>
      </div>

      <div className="p-4 space-y-4 sm:p-5">
        {/* Existing feedback */}
        {feedbacks.length > 0 && (
          <div className="space-y-3">
            {feedbacks.map((fb) => (
              <div key={fb.id} className="rounded-lg bg-gray-700/50 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
                    {fb.author}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {new Date(fb.created_at).toLocaleString()}
                  </span>
                </div>
                {fb.rating && (
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <svg
                        key={s}
                        className={`h-3.5 w-3.5 ${s <= fb.rating! ? "text-yellow-400" : "text-gray-600"}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                )}
                {fb.text_content && (
                  <p className="text-sm text-gray-200">{fb.text_content}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Submit new feedback */}
        {!submitted ? (
          <div className="space-y-4">
            {/* Star rating */}
            <div>
              <label className="mb-2 block text-xs text-gray-400">Rate this conversation</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRating(s)}
                    className="transition hover:scale-110"
                  >
                    <svg
                      className={`h-7 w-7 sm:h-6 sm:w-6 ${s <= rating ? "text-yellow-400" : "text-gray-600"}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>

            {/* Text feedback */}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Share your thoughts on this conversation..."
              rows={3}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none sm:py-2 sm:text-xs"
            />

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || rating === 0}
              className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition active:scale-[0.98] hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed sm:py-2.5"
            >
              {submitting ? "Submitting..." : "Submit Feedback"}
            </button>
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-sm text-emerald-400 font-medium">Thank you for your feedback!</p>
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="mt-2 text-xs text-gray-400 transition hover:text-gray-300"
            >
              Leave another
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
