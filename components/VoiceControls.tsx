"use client";

import { AgentState } from "@/lib/types";

type Props = {
  state: AgentState;
  onStart: () => void;
  onStop: () => void;
  error: string | null;
};

export default function VoiceControls({ state, onStart, onStop, error }: Props) {
  const isActive = state === "connecting" || state === "listening" || state === "agent-speaking";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <button
          onClick={onStart}
          disabled={isActive}
          className="flex-1 rounded-lg bg-indigo-600 px-5 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 sm:py-3"
        >
          {state === "connecting" ? "Connecting..." : "Start Voice Test"}
        </button>

        <button
          onClick={onStop}
          disabled={!isActive}
          className="flex-1 rounded-lg bg-red-600 px-5 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40 sm:py-3"
        >
          Stop Voice Test
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
