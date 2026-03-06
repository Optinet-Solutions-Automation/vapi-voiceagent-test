"use client";

import { AgentState } from "@/lib/types";

const stateConfig: Record<AgentState, { label: string; color: string; pulse: boolean }> = {
  idle: { label: "Idle", color: "bg-gray-500", pulse: false },
  connecting: { label: "Connecting", color: "bg-yellow-500", pulse: true },
  listening: { label: "Listening", color: "bg-green-500", pulse: true },
  "agent-speaking": { label: "Agent Speaking", color: "bg-blue-500", pulse: true },
  disconnected: { label: "Disconnected", color: "bg-gray-500", pulse: false },
  error: { label: "Error", color: "bg-red-500", pulse: false },
};

export default function StatusIndicator({ state }: { state: AgentState }) {
  const config = stateConfig[state];

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-3 w-3">
        {config.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${config.color}`}
          />
        )}
        <span className={`relative inline-flex h-3 w-3 rounded-full ${config.color}`} />
      </div>
      <span className="text-sm font-medium text-gray-300">{config.label}</span>
    </div>
  );
}
