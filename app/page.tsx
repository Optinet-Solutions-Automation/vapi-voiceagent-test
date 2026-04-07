"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getVapi } from "@/lib/vapi";
import { useAgent } from "@/lib/agent-context";
import { AgentState, TranscriptMessage } from "@/lib/types";
import {
  saveConversation,
  addTrackerItem,
  getActivePrompt,
  listPrompts,
  createPrompt,
  setActivePrompt,
  getCallSettings,
  saveCallSettings,
} from "@/lib/db";
import type { PromptLibraryItem } from "@/lib/database.types";

const VOICE_OPTIONS = [
  { label: "Stephen – Sales and Customer Service",    provider: "11labs", voiceId: "3jR9BuQAOPMWUjWpi0ll" },
  { label: "Mark – Dynamic, Balanced and Emotional",  provider: "11labs", voiceId: "UgBBYS2sOqTuMpoF3BR0" },
  { label: "Mark – Natural Conversations",            provider: "11labs", voiceId: "6YQMyaUWlj0VX652cY1C" },
  { label: "Jackson – American Tech Sales Rep",       provider: "11labs", voiceId: "2zGvynULFssveGrcP8hi" },
  { label: "George – Natural, Full and Confident",    provider: "11labs", voiceId: "YaarrMwvJxVUpjbZ2RpC" },
  { label: "Alex – Professional",                     provider: "11labs", voiceId: "pHqSZYhjNK8nDCPRglTL" },
  { label: "Matthew Logovik",                         provider: "11labs", voiceId: "1IthILLNX448pH19aMvC" },
] as const;
import StatusIndicator from "@/components/StatusIndicator";
import TranscriptPanel from "@/components/TranscriptPanel";
import Onboarding, { useOnboarding, getNickname } from "@/components/Onboarding";


type DisplayMessage = TranscriptMessage & { id?: string };

export default function Home() {
  const router = useRouter();
  const { showOnboarding, markComplete } = useOnboarding();
  const { session } = useAgent();
  const assistantId = session?.assistantId ?? "";
  const isOwner = session?.isOwner ?? false;

  // ── Agent to call (may differ from session agent) ────────────
  const [callAgentId, setCallAgentId] = useState(assistantId);
  const [callAgentName, setCallAgentName] = useState(session?.assistantName ?? "");
  const [availableAgents, setAvailableAgents] = useState<{ id: string; name: string }[]>([]);
  // Can edit prompt/voice only when calling own agent as owner
  const callOwner = callAgentId === assistantId && isOwner;

  // ── Call state ──────────────────────────────────────────────
  const [state, setState] = useState<AgentState>("idle");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const vapiRef = useRef<ReturnType<typeof getVapi> | null>(null);
  const callIdRef = useRef<string | null>(null);
  const messagesRef = useRef<DisplayMessage[]>([]);

  // ── Notes ────────────────────────────────────────────────────
  const [notes, setNotes] = useState("");

  // ── System prompt ────────────────────────────────────────────
  const [promptContent, setPromptContent] = useState("");
  const [promptId, setPromptId] = useState<string | null>(null);
  const [promptName, setPromptName] = useState<string | null>(null);
  const [promptIsActive, setPromptIsActive] = useState(false);
  const [promptDirty, setPromptDirty] = useState(false);
  const [newPromptName, setNewPromptName] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  // ── Voice / call settings ────────────────────────────────────
  const [voiceProvider, setVoiceProvider] = useState("11labs");
  const [voiceId, setVoiceId] = useState("3jR9BuQAOPMWUjWpi0ll");
  const [savedVoiceId, setSavedVoiceId] = useState("3jR9BuQAOPMWUjWpi0ll");
  const [voiceDirty, setVoiceDirty] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // ── Prompt picker ─────────────────────────────────────────────
  const [showPromptPicker, setShowPromptPicker] = useState(false);
  const [allPrompts, setAllPrompts] = useState<PromptLibraryItem[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(false);

  const isActive = state === "connecting" || state === "listening" || state === "agent-speaking";

  // Keep ref in sync so the call-end listener can read current messages
  messagesRef.current = messages;

  // ── Fetch all agents for the selector ────────────────────────
  useEffect(() => {
    fetch("/api/vapi-assistants")
      .then((r) => r.json())
      .then((agents) => { if (Array.isArray(agents)) setAvailableAgents(agents); })
      .catch(() => {});
  }, []);

  // Sync call agent when session loads
  useEffect(() => {
    if (assistantId) { setCallAgentId(assistantId); setCallAgentName(session?.assistantName ?? ""); }
  }, [assistantId]);

  // ── Load settings when call agent changes ────────────────────
  useEffect(() => {
    if (!callAgentId) return;

    setPromptContent("");
    setPromptId(null);
    setPromptName(null);
    setPromptIsActive(false);
    setPromptDirty(false);
    setNewPromptName("");

    const isOwnAgent = callAgentId === assistantId;

    const vapiFetch = fetch(`/api/vapi-assistant?assistantId=${callAgentId}`)
      .then((r) => r.json())
      .catch(() => ({}));

    Promise.all([
      vapiFetch,
      getActivePrompt(callAgentId).catch(() => null),
      isOwnAgent ? getCallSettings().catch(() => null) : Promise.resolve(null),
    ]).then(([vapiData, dbPrompt, dbVoice]) => {
      if (dbPrompt) {
        setPromptContent(dbPrompt.content);
        setPromptId(dbPrompt.id);
        setPromptName(dbPrompt.name);
        setPromptIsActive(true);
      } else if (vapiData?.systemPrompt) {
        setPromptContent(vapiData.systemPrompt);
      }

      if (dbVoice) {
        setVoiceProvider(dbVoice.voice_provider);
        setVoiceId(dbVoice.voice_id);
        setSavedVoiceId(dbVoice.voice_id);
      } else {
        const v = vapiData?.assistant?.voice;
        if (v?.provider) setVoiceProvider(v.provider);
        if (v?.voiceId) { setVoiceId(v.voiceId); setSavedVoiceId(v.voiceId); }
      }
    });
  }, [callAgentId]);

  // ── VAPI event listeners ─────────────────────────────────────
  useEffect(() => {
    const vapi = getVapi();
    vapiRef.current = vapi;

    vapi.on("call-start", () => { setState("listening"); setError(null); });

    function endCall() {
      setState("idle");
      if (messagesRef.current.length > 0) {
        setShowSaveModal(true);
      }
    }

    vapi.on("call-end", endCall);
    vapi.on("speech-start", () => { setState("agent-speaking"); });
    vapi.on("speech-end", () => { setState("listening"); });

    vapi.on("message", (msg: any) => {
      try {
        if (msg.type === "conversation-update" && Array.isArray(msg.conversation)) {
          const conversation = msg.conversation as Array<{ role: string; content: string }>;
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
      } catch { /* ignore */ }
    });

    vapi.on("error", (err: any) => {
      // Treat unexpected disconnects (silence timeout, network drop, etc.) as an end-of-call
      // so the user is prompted to save whatever was captured, rather than losing it.
      endCall();
      // Show the error non-destructively only if there was nothing to save
      if (messagesRef.current.length === 0) {
        const errorMessage = err?.message || err?.error?.message || "Call ended unexpectedly";
        setError(errorMessage);
      }
    });

    return () => { vapi.removeAllListeners(); };
  }, []);

  // ── Call handlers ─────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (promptDirty) {
      if (!window.confirm("You have unsaved prompt changes. Start call anyway?")) return;
    }
    setError(null);
    setState("connecting");
    setMessages([]);
    callIdRef.current = null;
    try {
      const vapi = vapiRef.current;
      if (!vapi) return;
      const call = await vapi.start(callAgentId);
      if (call?.id) callIdRef.current = call.id;
    } catch (err: any) {
      const msg =
        err?.message?.includes("permission") || err?.message?.includes("NotAllowed")
          ? "Microphone permission denied. Please allow microphone access and try again."
          : err?.message || "Failed to start voice session";
      setError(msg);
      setState("error");
    }
  }, [promptDirty]);

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
      const id = await saveConversation(title, messages, callIdRef.current, callAgentId, callAgentName || null, tester, promptId, promptName, promptContent);
      const trackerItem = await addTrackerItem(`New conversation saved: ${title}`, tester, id);
      router.push(`/tracker/item/${trackerItem.id}`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to save conversation");
    } finally {
      setSaving(false);
    }
  }, [messages]);

  // ── Prompt handlers ───────────────────────────────────────────
  async function handleSaveVoice() {
    setSavingVoice(true);
    setVoiceError(null);
    try {
      const res = await fetch("/api/vapi-assistant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId: callAgentId, voice: { provider: voiceProvider, voiceId: voiceId } }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to update voice");
      }
      await saveCallSettings(voiceProvider, voiceId);
      setSavedVoiceId(voiceId);
      setVoiceDirty(false);
    } catch (e: any) {
      setVoiceError(e?.message ?? "Failed to save voice");
    } finally {
      setSavingVoice(false);
    }
  }

  async function handleSavePrompt() {
    if (!promptContent.trim()) return;
    setSavingPrompt(true);
    setPromptError(null);
    try {
      // Push current content to VAPI
      const res = await fetch("/api/vapi-assistant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId: callAgentId, systemPrompt: promptContent }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to update VAPI assistant");
      }

      if (promptDirty) {
        const timestamp = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        const finalName = newPromptName.trim() || (promptName ? promptName.replace(/ \(.*\)$/, "") : "Prompt");
        const p = await createPrompt(`${finalName} (${timestamp})`, promptContent, undefined, callAgentId);
        await setActivePrompt(p.id, callAgentId);
        setPromptId(p.id);
        setPromptName(p.name);
        setNewPromptName("");
      } else if (promptId) {
        await setActivePrompt(promptId, callAgentId);
      }

      setPromptDirty(false);
      setPromptIsActive(true);
    } catch (e: any) {
      setPromptError(e?.message ?? "Failed to save prompt");
    } finally {
      setSavingPrompt(false);
    }
  }

  async function handleOpenPromptPicker() {
    setShowPromptPicker(true);
    setLoadingPrompts(true);
    try {
      const data = await listPrompts(callAgentId);
      setAllPrompts(data.sort((a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0)));
    } catch { /* silent */ } finally {
      setLoadingPrompts(false);
    }
  }

  function handlePickPrompt(p: PromptLibraryItem) {
    setPromptContent(p.content);
    setPromptId(p.id);
    setPromptName(p.name);
    setPromptIsActive(p.is_active);
    setPromptDirty(false);
    setNewPromptName("");
    setShowPromptPicker(false);
  }

  return (
    <>
      {showOnboarding && <Onboarding onComplete={markComplete} />}

      {/* ── Save Conversation Modal ── */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          {/* Dialog */}
          <div className="relative w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
            <div className="mb-1 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/20">
                <svg className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-white">Save this conversation?</h2>
            </div>
            <p className="mb-6 pl-12 text-sm text-gray-400">
              The transcript will be saved so you can review it, add comments, and track feedback later.
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  setShowSaveModal(false);
                  await handleSave();
                }}
                disabled={saving}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                {saving ? "Saving..." : "Yes, Save"}
              </button>
              <button
                onClick={() => setShowSaveModal(false)}
                disabled={saving}
                className="flex-1 rounded-lg border border-gray-600 px-4 py-2.5 text-sm font-semibold text-gray-300 transition hover:bg-gray-800 disabled:opacity-40"
              >
                No, Discard
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:h-full lg:overflow-hidden">

        {/* Page header */}
        <header className="shrink-0 border-b border-gray-800 px-4 py-4 sm:px-6">
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Call Dashboard</h1>
          <p className="mt-0.5 text-sm text-gray-500">Run voice tests and review transcripts in real time</p>
        </header>

        {/* Body */}
        <div className="flex flex-col lg:flex-row lg:flex-1 lg:min-h-0">

          {/* ── Left: System Prompt Editor ── */}
          <div className="relative flex shrink-0 flex-col border-b border-gray-800 lg:w-[30rem] xl:w-[36rem] lg:border-b-0 lg:border-r lg:overflow-hidden">

            {/* ── Call Settings ── */}
            <div className="shrink-0 border-b border-gray-800 px-4 py-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Call Settings</p>

              {/* Agent selector */}
              <div>
                <label className="mb-1 block text-xs text-gray-500">Agent to Call</label>
                <select
                  value={callAgentId}
                  disabled={isActive}
                  onChange={(e) => {
                    const selected = availableAgents.find((a) => a.id === e.target.value);
                    if (selected) { setCallAgentId(selected.id); setCallAgentName(selected.name); }
                  }}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none disabled:opacity-50 [color-scheme:dark]"
                >
                  {availableAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}{a.id === assistantId ? " (yours)" : ""}
                    </option>
                  ))}
                  {availableAgents.length === 0 && (
                    <option value={callAgentId}>{callAgentName || callAgentId}</option>
                  )}
                </select>
                {callAgentId !== assistantId && (
                  <p className="mt-1 text-[11px] text-amber-400">Viewing read-only — you can call but not edit this agent</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Voice
                  {savedVoiceId && VOICE_OPTIONS.find(v => v.voiceId === savedVoiceId) && (
                    <span className="ml-2 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                      Active: {VOICE_OPTIONS.find(v => v.voiceId === savedVoiceId)!.label}
                    </span>
                  )}
                </label>
                <select
                  value={voiceId}
                  disabled={isActive}
                  onChange={(e) => {
                    const v = VOICE_OPTIONS.find(o => o.voiceId === e.target.value);
                    if (v) { setVoiceProvider(v.provider); setVoiceId(v.voiceId); setVoiceDirty(v.voiceId !== savedVoiceId); }
                  }}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none disabled:opacity-50 [color-scheme:dark]"
                >
                  {VOICE_OPTIONS.map((v) => (
                    <option key={v.voiceId} value={v.voiceId}>{v.label}</option>
                  ))}
                </select>
              </div>
              {voiceError && <p className="text-xs text-red-400">{voiceError}</p>}
              <button
                onClick={handleSaveVoice}
                disabled={!voiceDirty || isActive || savingVoice || !callOwner}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                {savingVoice ? "Saving..." : "Save Voice"}
              </button>
            </div>

            {/* ── System Prompt header ── */}
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">System Prompt</p>
                {promptIsActive && !promptDirty && promptName && (
                  <p className="truncate text-[11px] text-emerald-400 mt-0.5">{promptName} · Active</p>
                )}
                {(!promptIsActive || promptDirty) && promptName && (
                  <p className="truncate text-[11px] text-gray-500 mt-0.5">{promptName}</p>
                )}
              </div>
              <button
                onClick={handleOpenPromptPicker}
                disabled={isActive}
                className="shrink-0 rounded-lg border border-gray-600 px-2.5 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-gray-800 disabled:opacity-40"
              >
                Select Prompt
              </button>
            </div>

            {/* Prompt textarea */}
            <div className="flex flex-1 flex-col p-4 gap-3 min-h-0">
              {isActive && (
                <div className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                  Editing is disabled during an active call
                </div>
              )}
              <textarea
                value={promptContent}
                onChange={(e) => {
                  setPromptContent(e.target.value);
                  if (!promptDirty) {
                    // Pre-fill name input with the base name on first edit
                    const base = promptName ? promptName.replace(/ \(.*\)$/, "") : "Prompt";
                    setNewPromptName(base);
                  }
                  setPromptDirty(true);
                }}
                disabled={isActive}
                placeholder="Paste or write your system prompt here..."
                className="flex-1 min-h-[180px] lg:min-h-0 w-full resize-none rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 font-mono text-xs text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            {/* Save button */}
            <div className="shrink-0 border-t border-gray-800 px-4 py-3 space-y-2">
              {promptDirty && (
                <input
                  type="text"
                  value={newPromptName}
                  onChange={(e) => setNewPromptName(e.target.value)}
                  placeholder="Name this version..."
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                />
              )}
              {promptError && (
                <p className="text-xs text-red-400">{promptError}</p>
              )}
              <button
                onClick={handleSavePrompt}
                disabled={promptIsActive && !promptDirty || isActive || savingPrompt || !promptContent.trim() || !callOwner}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
              >
                {savingPrompt ? "Saving..." : promptDirty ? "Save as New Version" : "Use This Prompt"}
              </button>
            </div>

            {/* Prompt picker overlay */}
            {showPromptPicker && (
              <div className="absolute inset-0 z-20 flex flex-col bg-gray-950 border-r border-gray-800">
                <div className="shrink-0 flex items-center justify-between border-b border-gray-800 px-4 py-3">
                  <p className="text-sm font-semibold text-white">Choose a Prompt</p>
                  <button
                    onClick={() => setShowPromptPicker(false)}
                    className="rounded p-1 text-gray-400 hover:text-white"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto py-2">
                  {loadingPrompts ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-500">Loading...</p>
                  ) : allPrompts.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-500">No saved prompts. Create one in the Prompt Library.</p>
                  ) : (
                    allPrompts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handlePickPrompt(p)}
                        className="w-full px-4 py-3 text-left transition hover:bg-gray-800"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-gray-200">{p.name}</span>
                          {p.is_active && (
                            <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-gray-500">
                          {new Date(p.created_at).toLocaleDateString()}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Right: Call Controls + Transcript + Notes ── */}
          <div className="flex flex-1 flex-col lg:min-h-0 lg:overflow-hidden">

            {/* Call controls */}
            <div className="shrink-0 border-b border-gray-800 p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <StatusIndicator state={state} />
                <div className="flex items-center gap-2">
                  {!isActive ? (
                    <button
                      onClick={handleStart}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-green-500"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      Call Voice Agent
                    </button>
                  ) : (
                    <button
                      onClick={handleStop}
                      className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-red-500"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      End Call
                    </button>
                  )}
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {error}
                </div>
              )}

            </div>

            {/* Transcript + feedback (scrollable middle) */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
              <TranscriptPanel
                fillHeight={false}
                messages={messages}
                title="Live Transcript"
                emptyText="Start a voice session to see the conversation here."
              />



            </div>

            {/* Notes — fixed at bottom */}
            <div className="shrink-0 border-t border-gray-800 p-4 sm:p-5">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                Call Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Jot notes during the call — observations, issues, follow-ups..."
                rows={3}
                className="w-full resize-none rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
