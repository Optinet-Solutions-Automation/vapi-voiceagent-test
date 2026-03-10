"use client";

import { useState } from "react";

type Props = {
  vapiCallId: string;
};

export default function CallRecording({ vapiCallId }: Props) {
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function handleLoad() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vapi-recording/${vapiCallId}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to fetch recording");
        return;
      }

      const url = data.stereoRecordingUrl || data.recordingUrl;
      if (!url) {
        setError("No recording available yet. It may still be processing.");
        return;
      }

      setRecordingUrl(url);
      setLoaded(true);
    } catch {
      setError("Failed to fetch recording");
    } finally {
      setLoading(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleLoad}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-gray-700 disabled:opacity-40"
        >
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          {loading ? "Loading..." : "Play Call Recording"}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        Call Recording
      </p>
      <audio src={recordingUrl!} controls className="w-full h-9" />
    </div>
  );
}
