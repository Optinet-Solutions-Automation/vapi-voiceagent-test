"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getVapi, VAPI_ASSISTANT_ID } from "@/lib/vapi";
import { AgentState, TranscriptMessage } from "@/lib/types";
import { saveConversation, getConversationWithMessages, addTrackerItem } from "@/lib/db";
import type { Message } from "@/lib/database.types";
import StatusIndicator from "@/components/StatusIndicator";
import VoiceControls from "@/components/VoiceControls";
import TranscriptPanel from "@/components/TranscriptPanel";
import ConversationHistory from "@/components/ConversationHistory";
import Onboarding, { useOnboarding, getNickname } from "@/components/Onboarding";
import FeedbackPanel from "@/components/FeedbackPanel";
import CallRecording from "@/components/CallRecording";

type DisplayMessage = TranscriptMessage & { id?: string };

export default function Home() {
  const { showOnboarding, markComplete } = useOnboarding();
  const [state, setState] = useState<AgentState>("idle");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [viewingConversation, setViewingConversation] = useState<string | null>(null);
  const [viewingCallId, setViewingCallId] = useState<string | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const vapiRef = useRef<ReturnType<typeof getVapi> | null>(null);
  const callIdRef = useRef<string | null>(null);

  useEffect(() => {
    const vapi = getVapi();
    vapiRef.current = vapi;

    vapi.on("call-start", () => {
      setState("listening");
      setError(null);
      // call ID is set from vapi.start() return value
    });

    vapi.on("call-end", () => {
      setState("idle");
    });

    vapi.on("speech-start", () => {
      setState("agent-speaking");
    });

    vapi.on("speech-end", () => {
      setState("listening");
    });

    vapi.on("message", (msg: any) => {
      if (msg.type === "conversation-update" && msg.conversation) {
        const conversation = msg.conversation as Array<{
          role: string;
          content: string;
        }>;
        setMessages(
          conversation
            .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
            .map((m) => ({
              role: m.role === "assistant" ? ("agent" as const) : ("user" as const),
              content: m.content,
              timestamp: new Date(),
            }))
        );
      }
    });

    vapi.on("error", (err: any) => {
      const errorMessage =
        err?.message || err?.error?.message || "An unexpected error occurred";
      setError(errorMessage);
      setState("error");
    });

    return () => {
      vapi.removeAllListeners();
    };
  }, []);

  const handleStart = useCallback(async () => {
    setError(null);
    setState("connecting");
    setMessages([]);
    setSavedId(null);
    setViewingConversation(null);
    setViewingCallId(null);
    callIdRef.current = null;

    try {
      const vapi = vapiRef.current;
      if (!vapi) return;
      const call = await vapi.start(VAPI_ASSISTANT_ID);
      if (call?.id) callIdRef.current = call.id;
    } catch (err: any) {
      const msg =
        err?.message?.includes("permission") || err?.message?.includes("NotAllowed")
          ? "Microphone permission denied. Please allow microphone access and try again."
          : err?.message || "Failed to start voice session";
      setError(msg);
      setState("error");
    }
  }, []);

  const handleStop = useCallback(() => {
    vapiRef.current?.stop();
    setState("idle");
  }, []);

  const handleSave = useCallback(async () => {
    if (messages.length === 0) return;
    setSaving(true);
    try {
      const now = new Date();
      const date = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const tester = getNickname();
      const title = `${date}, ${time} - ${tester}`;
      const id = await saveConversation(title, messages, callIdRef.current);
      setSavedId(id);
      setHistoryRefresh((n) => n + 1);

      // Auto-add a comment in the tracker for this conversation
      await addTrackerItem(`New conversation saved: ${title}`, tester, id).catch(() => {});

      // Reload as saved messages so comments become available
      await handleLoadConversation(id);
    } catch (err: any) {
      setError(err?.message ?? "Failed to save conversation");
    } finally {
      setSaving(false);
    }
  }, [messages]);

  async function handleLoadConversation(id: string) {
    try {
      const { conversation, messages: dbMessages } = await getConversationWithMessages(id);
      setViewingConversation(conversation.title);
      setViewingCallId(conversation.vapi_call_id);
      setSavedId(id);
      setMessages(
        dbMessages.map((m: Message) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at),
        }))
      );
    } catch (err: any) {
      setError(err?.message ?? "Failed to load conversation");
    }
  }

  function handleBackToLive() {
    setViewingConversation(null);
    setViewingCallId(null);
    setSavedId(null);
    setMessages([]);
  }

  const isActive = state === "connecting" || state === "listening" || state === "agent-speaking";
  const canSave = !isActive && messages.length > 0 && !savedId;

  return (
    <>
    {showOnboarding && <Onboarding onComplete={markComplete} />}
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-3 py-6 pb-[env(safe-area-inset-bottom)] sm:gap-6 sm:px-4 sm:py-10">
      {/* Header */}
      <header className="text-center">
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
          Voice Agent Testing Console
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Speak with the Vapi assistant and debug in real time
        </p>
        <Link
          href="/tracker"
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-400 transition hover:bg-gray-800 hover:text-gray-200"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          Comment Tracker
        </Link>
      </header>

      {/* Controls Card */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 backdrop-blur space-y-4 sm:p-5 sm:space-y-5">
        <StatusIndicator state={state} />
        <VoiceControls state={state} onStart={handleStart} onStop={handleStop} error={error} />

        {/* Save / viewing controls */}
        <div className="flex items-center gap-3">
          {canSave && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save Conversation"}
            </button>
          )}

          {savedId && !viewingConversation && (
            <span className="text-sm text-emerald-400">Saved successfully</span>
          )}

          {viewingConversation && (
            <button
              onClick={handleBackToLive}
              className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-700"
            >
              Back to Live
            </button>
          )}
        </div>
      </div>

      {/* Transcript */}
      <TranscriptPanel
        messages={messages}
        title={viewingConversation ? `Review: ${viewingConversation}` : "Live Transcript"}
        emptyText={
          viewingConversation
            ? "This conversation has no messages."
            : "Start a voice session to see the conversation here."
        }
      />

      {/* Call Recording — show when viewing a saved conversation with a call ID */}
      {viewingCallId && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 backdrop-blur sm:p-5">
          <CallRecording vapiCallId={viewingCallId} />
        </div>
      )}

      {/* Feedback — show when conversation is saved */}
      {savedId && (
        <FeedbackPanel conversationId={savedId} />
      )}

      {/* Saved Conversations */}
      <ConversationHistory
        onSelect={handleLoadConversation}
        refreshKey={historyRefresh}
        limit={5}
      />
    </div>
    </>
  );
}
