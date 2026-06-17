"use client";

import { useEffect, useMemo, useState } from "react";
import LabAgentSetup from "@/components/lab/LabAgentSetup";
import OrganizerTable from "@/components/lab/OrganizerTable";
import LabSettingsCard from "@/components/lab/LabSettingsCard";
import LabCallPanel from "@/components/lab/LabCallPanel";
import ListenerMonitor from "@/components/lab/ListenerMonitor";
import Drawer from "@/components/lab/Drawer";
import { listRecentLabEvents, getLabSettings, listHandlers } from "@/lib/lab-db";
import type { LabCallEvent } from "@/lib/database.types";

type Run = {
  callId: string;
  startedAt: string;
  events: number;
  injections: number;
  avgLatencyMs: number | null;
};

type DrawerName = "setup" | "settings" | "organizer" | null;

export default function ListenerLabPage() {
  const [assistantId, setAssistantId] = useState("");
  const [, setAssistantName] = useState("");

  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [callActive, setCallActive] = useState(false);
  const [viewedCallId, setViewedCallId] = useState<string | null>(null);

  const [recentEvents, setRecentEvents] = useState<LabCallEvent[]>([]);
  const [handlerCount, setHandlerCount] = useState<number | null>(null);
  const [openDrawer, setOpenDrawer] = useState<DrawerName>(null);

  function refreshRuns() {
    listRecentLabEvents(1000)
      .then(setRecentEvents)
      .catch(() => {});
  }
  function refreshHandlerCount() {
    listHandlers()
      .then((h) => setHandlerCount(h.filter((x) => x.intent_key !== "first_message").length))
      .catch(() => {});
  }

  useEffect(() => {
    // Seed the call panel with the saved lab assistant so "Start Call" works
    // without first opening the setup drawer.
    getLabSettings()
      .then((s) => {
        if (s?.lab_assistant_id) setAssistantId(s.lab_assistant_id);
      })
      .catch(() => {});
    refreshRuns();
    refreshHandlerCount();
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

  const tabBtn =
    "inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium text-gray-300 transition hover:bg-gray-800";

  return (
    <div className="flex flex-col px-4 py-6 pb-[env(safe-area-inset-bottom)] sm:px-6 sm:py-8 space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Listener Lab</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Short behavior-only agent; knowledge and actions fed mid-call by the Organizer. Configure
            below, then run a test call. The classic long-prompt flow on the Call Dashboard stays
            untouched for comparison.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setOpenDrawer("setup")} className={tabBtn}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Agent Setup
          </button>
          <button onClick={() => setOpenDrawer("organizer")} className={tabBtn}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Organizer
            {handlerCount != null && (
              <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                {handlerCount}
              </span>
            )}
          </button>
          <button onClick={() => setOpenDrawer("settings")} className={tabBtn}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
        </div>
      </header>

      {/* Primary workspace: live test + monitor */}
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

      {!assistantId && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
          No lab assistant configured yet — open <strong>Agent Setup</strong> to pick one and click
          &ldquo;Configure for Lab&rdquo; before starting a call.
        </div>
      )}

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
            onClick={() => setViewedCallId(r.callId)}
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
              <span className="text-[11px] font-semibold text-emerald-400">avg {r.avgLatencyMs} ms</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Config drawers (hidden by default) ── */}
      <Drawer
        open={openDrawer === "setup"}
        onClose={() => setOpenDrawer(null)}
        title="Agent Setup"
        subtitle="The politician: short behavior prompt + voice, then configure for the lab"
        width="max-w-2xl"
      >
        <LabAgentSetup
          onAssistantChange={(id, name) => {
            setAssistantId(id);
            setAssistantName(name);
          }}
        />
      </Drawer>

      <Drawer
        open={openDrawer === "organizer"}
        onClose={() => {
          setOpenDrawer(null);
          refreshHandlerCount();
        }}
        title="Organizer — Situation Handlers"
        subtitle="The staff playbook: intents, matched lines, and how they're delivered"
        width="max-w-4xl"
      >
        <OrganizerTable />
      </Drawer>

      <Drawer
        open={openDrawer === "settings"}
        onClose={() => setOpenDrawer(null)}
        title="Listener Settings"
        subtitle="How aggressively the staff whispers"
        width="max-w-lg"
      >
        <LabSettingsCard />
      </Drawer>
    </div>
  );
}
