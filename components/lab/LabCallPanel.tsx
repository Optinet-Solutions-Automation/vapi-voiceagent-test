"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getVapi, vapiErrorText as errText, isBenignCallEnd } from "@/lib/vapi";
import { AgentState, TranscriptMessage } from "@/lib/types";
import { listHandlers, getLabSettings, getScriptGraph } from "@/lib/lab-db";
import StatusIndicator from "@/components/StatusIndicator";
import TranscriptPanel from "@/components/TranscriptPanel";

type Props = {
  assistantId: string;
  onCallStarted: (callId: string) => void;
  onCallEnded: () => void;
};

export default function LabCallPanel({ assistantId, onCallStarted, onCallEnded }: Props) {
  const [state, setState] = useState<AgentState>("idle");
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const vapiRef = useRef<ReturnType<typeof getVapi> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("lab_client_name");
    if (saved) setClientName(saved);
  }, []);

  const isActive = state === "connecting" || state === "listening" || state === "agent-speaking";

  useEffect(() => {
    const vapi = getVapi();
    vapiRef.current = vapi;

    vapi.on("call-start", () => {
      setState("listening");
      setError(null);
    });
    vapi.on("call-end", () => {
      setState("idle");
      onCallEnded();
    });
    vapi.on("speech-start", () => setState("agent-speaking"));
    vapi.on("speech-end", () => setState("listening"));
    vapi.on("message", (msg: any) => {
      try {
        if (msg.type === "conversation-update" && Array.isArray(msg.conversation)) {
          setMessages(
            (msg.conversation as Array<{ role: string; content: string }>)
              .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
              .map((m) => ({
                role: m.role === "assistant" ? ("agent" as const) : ("user" as const),
                content: m.content,
                timestamp: new Date(),
              }))
          );
        }
      } catch {
        /* ignore */
      }
    });
    vapi.on("error", (err: any) => {
      setState("idle");
      onCallEnded();
      // VAPI ending the call (silence timeout, end-call control) surfaces as an
      // ejection "error" — that's a normal end, not something to alarm about.
      if (!isBenignCallEnd(err)) {
        setError(errText(err, "Call ended unexpectedly"));
      }
    });

    return () => {
      vapi.removeAllListeners();
    };
  }, []);

  const handleStart = useCallback(async () => {
    setError(null);
    setState("connecting");
    setMessages([]);
    try {
      const vapi = vapiRef.current;
      if (!vapi) return;
      localStorage.setItem("lab_client_name", clientName);

      // Opening line: the active script's Start box wins (per-campaign
      // opening); otherwise the global "first_message" scenario. {{name}} is
      // personalized here.
      let overrides: Record<string, unknown> | undefined;
      try {
        let opening: string | null = null;
        const settings = await getLabSettings().catch(() => null);
        if (settings?.active_script_id) {
          const g = await getScriptGraph(settings.active_script_id).catch(() => ({ nodes: [], edges: [] }));
          const start = g.nodes.find((n) => n.type === "start");
          const op = ((start?.config as Record<string, unknown>)?.opening as string | undefined)?.trim();
          if (op) opening = op;
        }
        if (!opening) {
          const handlers = await listHandlers();
          const fm = handlers.find((h) => h.intent_key === "first_message" && h.enabled);
          if (fm?.response_template) opening = fm.response_template;
        }
        if (opening) {
          const rendered = opening
            .replace(/\{\{\s*name\s*\}\}/gi, clientName.trim() || "there")
            .replace(/\s{2,}/g, " ");
          overrides = { firstMessage: rendered, firstMessageMode: "assistant-speaks-first" };
        }
      } catch {
        /* no handler / DB hiccup → fall back to the assistant's own first message */
      }

      const call = await vapi.start(assistantId, overrides);
      if (call?.id) onCallStarted(call.id);
    } catch (err: any) {
      const raw = errText(err, "Failed to start call");
      const msg =
        raw.includes("permission") || raw.includes("NotAllowed")
          ? "Microphone permission denied."
          : raw;
      setError(msg);
      setState("error");
    }
  }, [assistantId, clientName]);

  const handleStop = useCallback(() => {
    vapiRef.current?.stop();
    setState("idle");
  }, []);

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Live Test Call</h2>
          <p className="text-[11px] text-gray-500">Talk to the lab agent from the browser.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <label className="text-[10px] text-gray-500">Client Name</label>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              disabled={isActive}
              placeholder="Chris"
              title='Fills {{name}} in the "First Message" scenario'
              className="w-28 rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            />
          </div>
          <StatusIndicator state={state} />
          {!isActive ? (
            <button
              onClick={handleStart}
              disabled={!assistantId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-40"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Start Call
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
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

      <TranscriptPanel
        messages={messages}
        dense
        title="Call Transcript"
        emptyText="Start a call to test the listener architecture."
      />
    </div>
  );
}
