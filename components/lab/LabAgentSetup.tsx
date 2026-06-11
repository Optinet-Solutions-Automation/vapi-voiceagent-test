"use client";

import { useEffect, useState } from "react";
import { VOICE_OPTIONS } from "@/lib/voices";
import { DEFAULT_SHORT_PROMPT } from "@/lib/lab-tools";
import { getLabSettings, saveLabSettings } from "@/lib/lab-db";

const inputCls =
  "w-full rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none";

type Props = {
  onAssistantChange: (id: string, name: string) => void;
};

export default function LabAgentSetup({ onAssistantChange }: Props) {
  const [assistants, setAssistants] = useState<{ id: string; name: string }[]>([]);
  const [assistantId, setAssistantId] = useState("");
  const [shortPrompt, setShortPrompt] = useState(DEFAULT_SHORT_PROMPT);
  const [voiceId, setVoiceId] = useState<string>(VOICE_OPTIONS[0].voiceId);
  const [serverOverride, setServerOverride] = useState("");
  const [envBaseUrl, setEnvBaseUrl] = useState<string | null>(null);

  const [savingPrompt, setSavingPrompt] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [configured, setConfigured] = useState<{ webhookUrl: string; toolCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/vapi-assistants")
      .then((r) => r.json())
      .then((a) => Array.isArray(a) && setAssistants(a))
      .catch(() => {});
    fetch("/api/lab/configure-assistant")
      .then((r) => r.json())
      .then((j) => setEnvBaseUrl(j.envBaseUrl ?? null))
      .catch(() => {});
    getLabSettings()
      .then((s) => {
        if (s?.lab_assistant_id) setAssistantId(s.lab_assistant_id);
        if (s?.short_prompt) setShortPrompt(s.short_prompt);
        if (s?.server_url_override) setServerOverride(s.server_url_override);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const a = assistants.find((x) => x.id === assistantId);
    if (a) onAssistantChange(a.id, a.name);
  }, [assistantId, assistants]);

  async function handleSavePromptVoice() {
    if (!assistantId) return;
    setSavingPrompt(true);
    setError(null);
    setNotice(null);
    try {
      const voice = VOICE_OPTIONS.find((v) => v.voiceId === voiceId);
      const res = await fetch("/api/vapi-assistant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId,
          systemPrompt: shortPrompt,
          ...(voice && { voice: { provider: voice.provider, voiceId: voice.voiceId } }),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to save");
      }
      await saveLabSettings({ short_prompt: shortPrompt });
      setNotice("Short prompt + voice saved to the assistant.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save prompt/voice");
    } finally {
      setSavingPrompt(false);
    }
  }

  async function handleConfigure() {
    if (!assistantId) return;
    setConfiguring(true);
    setError(null);
    setNotice(null);
    setConfigured(null);
    try {
      await saveLabSettings({ server_url_override: serverOverride.trim() || null });
      const res = await fetch("/api/lab/configure-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Configure failed");
      setConfigured({ webhookUrl: j.webhookUrl, toolCount: j.toolCount });
    } catch (e: any) {
      setError(e?.message ?? "Configure failed");
    } finally {
      setConfiguring(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-white">Lab Agent Setup</h2>
        <p className="text-[11px] text-gray-500">
          The politician: short behavior-only prompt. Knowledge comes from the Organizer below.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-gray-400">Lab Assistant</label>
          <select
            className={inputCls + " [color-scheme:dark]"}
            value={assistantId}
            onChange={(e) => setAssistantId(e.target.value)}
          >
            <option value="">Select an assistant…</option>
            {assistants.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-amber-400/80">
            Use a dedicated test assistant — configuring replaces its tools and webhook.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-400">Voice</label>
          <select
            className={inputCls + " [color-scheme:dark]"}
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
          >
            {VOICE_OPTIONS.map((v) => (
              <option key={v.voiceId} value={v.voiceId}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-gray-400">
          Short Behavior Prompt <span className="text-gray-600">(persona + how to treat [STAFF] notes — no knowledge)</span>
        </label>
        <textarea
          className={inputCls + " resize-none font-mono text-xs"}
          rows={8}
          value={shortPrompt}
          onChange={(e) => setShortPrompt(e.target.value)}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-gray-400">
          Webhook Server URL{" "}
          <span className="text-gray-600">
            (env default: {envBaseUrl ?? "not set"} — override for local dev with your ngrok URL)
          </span>
        </label>
        <input
          className={inputCls}
          value={serverOverride}
          onChange={(e) => setServerOverride(e.target.value)}
          placeholder="https://abc123.ngrok-free.app"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {notice && <p className="text-xs text-emerald-400">{notice}</p>}
      {configured && (
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
            {configured.toolCount} tools ✓
          </span>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
            live transcript ✓
          </span>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
            control ✓
          </span>
          <span className="rounded-full bg-gray-700 px-2 py-0.5 text-[11px] text-gray-300">
            {configured.webhookUrl}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          onClick={handleSavePromptVoice}
          disabled={!assistantId || savingPrompt}
          className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
        >
          {savingPrompt ? "Saving..." : "Save Prompt + Voice"}
        </button>
        <button
          onClick={handleConfigure}
          disabled={!assistantId || configuring}
          className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
        >
          {configuring ? "Configuring..." : "Configure for Lab (tools + listener)"}
        </button>
      </div>
    </div>
  );
}
