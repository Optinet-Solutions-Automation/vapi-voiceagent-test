"use client";

import { useEffect, useMemo, useState } from "react";
import LabAgentSetup from "@/components/lab/LabAgentSetup";
import OrganizerTable from "@/components/lab/OrganizerTable";
import LabSettingsCard from "@/components/lab/LabSettingsCard";
import LabCallPanel from "@/components/lab/LabCallPanel";
import ListenerMonitor from "@/components/lab/ListenerMonitor";
import { listRecentLabEvents } from "@/lib/lab-db";
import type { LabCallEvent } from "@/lib/database.types";

type Run = {
  callId: string;
  startedAt: string;
  events: number;
  injections: number;
  avgLatencyMs: number | null;
};

export default function ListenerLabPage() {
  const [assistantId, setAssistantId] = useState("");
  const [, setAssistantName] = useState("");

  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [callActive, setCallActive] = useState(false);
  const [viewedCallId, setViewedCallId] = useState<string | null>(null);

  const [recentEvents, setRecentEvents] = useState<LabCallEvent[]>([]);

  function refreshRuns() {
    listRecentLabEvents(1000)
      .then(setRecentEvents)
      .catch(() => {});
  }

  useEffect(() => {
    refreshRuns();
  }, []);

  const runs: Run[] = useMemo(() => {
    const byCall = new Map<string, LabCallEvent[]>();
    for (const e of recentEvents) {
      if (e.call_id === "unknown") continue;
      if (!byCall.has(e.call_id)) byCall.set(e.call_id, []);
      byCall.get(e.call_id)!.push(e);
    }
    return Array.from(byCall.entries())
      .map(([callId, evs]) => {
        const injected = evs.filter((e) => e.event_type === "injected" && e.latency_ms != null);
        const startedAt = evs.reduce(
          (min, e) => (e.created_at < min ? e.created_at : min),
          evs[0].created_at
        );
        return {
          callId,
          startedAt,
          events: evs.length,
          injections: injected.length,
          avgLatencyMs:
            injected.length > 0
              ? Math.round(injected.reduce((s, e) => s + (e.latency_ms ?? 0), 0) / injected.length)
              : null,
        };
      })
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .slice(0, 20);
  }, [recentEvents]);

  const monitorCallId = callActive ? activeCallId : viewedCallId ?? activeCallId;

  return (
    <div className="flex flex-col px-4 py-6 pb-[env(safe-area-inset-bottom)] sm:px-6 sm:py-8 space-y-5">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">Listener Lab</h1>
        <p className="mt-1 text-sm text-gray-500">
          Prototype of the backend-listener architecture: a short behavior-only agent, with knowledge
          and actions fed mid-call by the Organizer. The classic long-prompt flow on the Call
          Dashboard stays untouched for comparison.
        </p>
      </header>

      {/* Setup + settings */}
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,380px)]">
        <LabAgentSetup
          onAssistantChange={(id, name) => {
            setAssistantId(id);
            setAssistantName(name);
          }}
        />
        <LabSettingsCard />
      </div>

      {/* Organizer */}
      <OrganizerTable />

      {/* Live test + monitor */}
      <div className="grid gap-4 lg:grid-cols-2">
        <LabCallPanel
          assistantId={assistantId}
          onCallStarted={(callId) => {
            setActiveCallId(callId);
            setViewedCallId(null);
            setCallActive(true);
          }}
          onCallEnded={() => {
            setCallActive(false);
            setTimeout(refreshRuns, 4000);
          }}
        />
        <ListenerMonitor callId={monitorCallId} active={callActive} />
      </div>

      {/* Past runs */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50 overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Past Runs</h2>
            <p className="text-[11px] text-gray-500">
              Click a run to replay its listener timeline in the monitor above.
            </p>
          </div>
          <button
            onClick={refreshRuns}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition hover:bg-gray-700"
          >
            Refresh
          </button>
        </div>

        {runs.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-500">
            No lab runs yet — start a test call.
          </p>
        )}

        {runs.map((r) => (
          <button
            key={r.callId}
            onClick={() => {
              setViewedCallId(r.callId);
            }}
            className={`flex w-full flex-wrap items-center gap-3 border-b border-gray-700/50 px-4 py-2.5 text-left transition last:border-b-0 hover:bg-gray-700/30 ${
              viewedCallId === r.callId ? "bg-gray-700/40" : ""
            }`}
          >
            <span className="font-mono text-[11px] text-gray-500">{r.callId.slice(0, 8)}…</span>
            <span className="text-xs text-gray-300">
              {new Date(r.startedAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            <span className="text-[11px] text-gray-500">{r.events} events</span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              {r.injections} injections
            </span>
            {r.avgLatencyMs != null && (
              <span className="text-[11px] font-semibold text-emerald-400">
                avg {r.avgLatencyMs} ms
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
