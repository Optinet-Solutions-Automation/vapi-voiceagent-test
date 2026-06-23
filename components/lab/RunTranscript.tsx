"use client";

import { useEffect, useState } from "react";
import TranscriptPanel from "@/components/TranscriptPanel";
import type { TranscriptMessage } from "@/lib/types";

type Props = { callId: string };

export default function RunTranscript({ callId }: Props) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setMessages([]);
    setRecordingUrl(null);
    fetch(`/api/vapi-call/${callId}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? "Failed to load transcript");
        return j;
      })
      .then((j) => {
        const t = Array.isArray(j.transcript) ? j.transcript : [];
        setMessages(
          t.map((m: { role: string; content: string }) => ({
            role: m.role === "user" ? ("user" as const) : ("agent" as const),
            content: m.content,
            timestamp: new Date(),
          }))
        );
        setRecordingUrl(j.stereoRecordingUrl ?? j.recordingUrl ?? null);
      })
      .catch((e) => setError(e?.message ?? "Failed to load transcript"))
      .finally(() => setLoading(false));
  }, [callId]);

  return (
    <div className="space-y-2">
      {recordingUrl && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Call Recording
          </p>
          <audio src={recordingUrl} controls className="w-full" />
        </div>
      )}
      <TranscriptPanel
        messages={messages}
        dense
        title="Call Transcript"
        emptyText={
          loading
            ? "Loading transcript…"
            : error
            ? error
            : "No transcript available for this call yet. It may still be processing."
        }
      />
    </div>
  );
}
