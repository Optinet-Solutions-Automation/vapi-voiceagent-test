"use client";

import { useEffect, useRef, useState } from "react";
import { submitFeedback, getFeedbackForConversation, uploadAudioFeedback } from "@/lib/db";
import { getNickname } from "./Onboarding";
import type { Feedback } from "@/lib/database.types";

type Props = {
  conversationId: string;
};

type RecordingState = "idle" | "recording" | "recorded";

export default function FeedbackPanel({ conversationId }: Props) {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [text, setText] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Voice recording state
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  useEffect(() => {
    getFeedbackForConversation(conversationId)
      .then(setFeedbacks)
      .catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function startRecording() {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setRecordingState("recorded");
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      recorder.start();
      setRecordingState("recording");
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch {
      setMicError("Microphone access denied.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function discardRecording() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingState("idle");
    setRecordingTime(0);
  }

  async function handleSubmit() {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      let uploadedAudioUrl: string | null = null;

      if (mode === "voice" && audioBlob) {
        uploadedAudioUrl = await uploadAudioFeedback(conversationId, audioBlob);
      }

      const fb = await submitFeedback(
        conversationId,
        getNickname(),
        rating,
        mode === "text" ? text.trim() || null : null,
        uploadedAudioUrl
      );
      setFeedbacks((prev) => [...prev, fb]);
      setSubmitted(true);
      setText("");
      setRating(0);
      discardRecording();
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
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
                {fb.audio_url && (
                  <audio src={fb.audio_url} controls className="w-full h-8 mt-1" />
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

            {/* Mode toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("text")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  mode === "text"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-700 text-gray-400 hover:text-gray-200"
                }`}
              >
                Text
              </button>
              <button
                type="button"
                onClick={() => setMode("voice")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  mode === "voice"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-700 text-gray-400 hover:text-gray-200"
                }`}
              >
                Voice
              </button>
            </div>

            {/* Text feedback */}
            {mode === "text" && (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Share your thoughts on this conversation..."
                rows={3}
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none sm:py-2 sm:text-xs"
              />
            )}

            {/* Voice feedback */}
            {mode === "voice" && (
              <div className="space-y-3">
                {micError && (
                  <p className="text-xs text-red-400">{micError}</p>
                )}

                {recordingState === "idle" && (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-sm text-gray-300 transition active:scale-[0.98] hover:bg-gray-600 sm:py-2.5"
                  >
                    <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" />
                      <path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.93V20H8a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07A7 7 0 0019 11z" />
                    </svg>
                    Tap to record feedback
                  </button>
                )}

                {recordingState === "recording" && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                      </span>
                      <span className="text-sm text-red-400 font-mono">
                        {formatTime(recordingTime)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition active:scale-[0.98] hover:bg-red-500 sm:py-2"
                    >
                      Stop
                    </button>
                  </div>
                )}

                {recordingState === "recorded" && audioUrl && (
                  <div className="space-y-2">
                    <audio src={audioUrl} controls className="w-full h-10" />
                    <button
                      type="button"
                      onClick={discardRecording}
                      className="text-xs text-gray-400 transition hover:text-red-400"
                    >
                      Discard and re-record
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || rating === 0 || (mode === "voice" && recordingState !== "recorded")}
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
