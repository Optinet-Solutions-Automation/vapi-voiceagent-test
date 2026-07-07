"use client";

import { useEffect, useRef, useState } from "react";
import { listLabCallEvents } from "@/lib/lab-db";
import type { LabCallEvent } from "@/lib/database.types";

type Props = {
  callId: string | null;
  /** While true, polls for new events every 1.5s */
  active: boolean;
};

const TYPE_STYLES: Record<string, { chip: string; label: string }> = {
  utterance: { chip: "bg-sky-500/15 text-sky-300", label: "heard" },
  agent_said: { chip: "bg-teal-500/15 text-teal-300", label: "agent said" },
  sms: { chip: "bg-amber-500/15 text-amber-300", label: "sms" },
  classified: { chip: "bg-violet-500/15 text-violet-300", label: "classified" },
  speculated: { chip: "bg-indigo-500/15 text-indigo-400", label: "speculated" },
  injected: { chip: "bg-emerald-500/15 text-emerald-300", label: "injected" },
  skipped: { chip: "bg-gray-700 text-gray-400", label: "skipped" },
  tool_call: { chip: "bg-fuchsia-500/15 text-fuchsia-300", label: "tool call" },
  tool_result: { chip: "bg-fuchsia-500/15 text-fuchsia-300", label: "tool result" },
  status: { chip: "bg-gray-700/60 text-gray-500", label: "status" },
  error: { chip: "bg-rose-500/15 text-rose-300", label: "error" },
};

export default function ListenerMonitor({ callId, active }: Props) {
  const [events, setEvents] = useState<LabCallEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastIdRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Reset when call changes
  useEffect(() => {
    setEvents([]);
    lastIdRef.current = 0;
    setError(null);
    if (callId) {
      // initial full load (covers reviewing past runs)
      listLabCallEvents(callId, 0)
        .then((evs) => {
          setEvents(evs);
          if (evs.length > 0) lastIdRef.current = evs[evs.length - 1].id;
        })
        .catch((e) => setError(e?.message ?? "Failed to load events"));
    }
  }, [callId]);

  // Poll while active (+ one final sweep shortly after the call ends)
  useEffect(() => {
    if (!callId) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const evs = await listLabCallEvents(callId!, lastIdRef.current);
        if (evs.length > 0) {
          lastIdRef.current = evs[evs.length - 1].id;
          setEvents((prev) => [...prev, ...evs]);
        }
      } catch {
        /* transient poll errors are fine */
      }
    }

    if (active) {
      timer = setInterval(poll, 1500);
    } else {
      // final sweep to catch end-of-call events
      const t = setTimeout(poll, 3000);
      return () => clearTimeout(t);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callId, active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  const injected = events.filter((e) => e.event_type === "injected" && e.latency_ms != null);
  const avgLatency =
    injected.length > 0
      ? Math.round(injected.reduce((s, e) => s + (e.latency_ms ?? 0), 0) / injected.length)
      : null;

  return (
    <div className="flex flex-col rounded-xl border border-gray-700 bg-gray-800/50 overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Listener Monitor</h2>
          <p className="text-[11px] text-gray-500">
            What the staff heard, decided, and whispered — in real time.
          </p>
        </div>
        {avgLatency != null && (
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
            avg inject {avgLatency} ms
          </span>
        )}
      </div>

      <div className="max-h-[420px] min-h-[160px] overflow-y-auto p-3 space-y-1.5">
        {!callId && (
          <p className="py-8 text-center text-sm text-gray-500">
            Start a test call to watch the listener work.
          </p>
        )}
        {callId && events.length === 0 && !error && (
          <p className="py-8 text-center text-sm text-gray-500">
            Waiting for events… (webhook must be reachable at the configured server URL)
          </p>
        )}
        {error && <p className="py-4 text-center text-sm text-red-400">{error}</p>}

        {events
          .filter((e) => e.event_type !== "status" || !e.content?.startsWith("speech-update"))
          .map((e) => {
            const style = TYPE_STYLES[e.event_type] ?? TYPE_STYLES.status;
            return (
              <div key={e.id} className="flex items-start gap-2 rounded-lg bg-gray-900/40 px-2.5 py-1.5">
                <span
                  className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.chip}`}
                >
                  {style.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-xs text-gray-300">{e.content ?? "—"}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
                    {e.intent_key && (
                      <code className="rounded bg-gray-700/60 px-1 py-0.5">{e.intent_key}</code>
                    )}
                    {e.confidence != null && <span>conf {Number(e.confidence).toFixed(2)}</span>}
                    {e.action_type && <span>{e.action_type}</span>}
                    {e.latency_ms != null && (
                      <span className="font-semibold text-emerald-400">{e.latency_ms} ms</span>
                    )}
                    {(e.meta as Record<string, unknown> | null)?.reason ? (
                      <span className="italic">({String((e.meta as Record<string, unknown>).reason)})</span>
                    ) : null}
                    <span>{new Date(e.created_at).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
