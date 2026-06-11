"use client";

import { useEffect, useState } from "react";
import { getLabSettings, saveLabSettings } from "@/lib/lab-db";

const inputCls =
  "w-full rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none";

export default function LabSettingsCard() {
  const [routerModel, setRouterModel] = useState("gpt-5.4-mini");
  const [threshold, setThreshold] = useState(0.7);
  const [cooldown, setCooldown] = useState(4000);
  const [triggerResponse, setTriggerResponse] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLabSettings()
      .then((s) => {
        if (!s) return;
        setRouterModel(s.router_model);
        setThreshold(s.confidence_threshold);
        setCooldown(s.injection_cooldown_ms);
        setTriggerResponse(s.trigger_response);
      })
      .catch((e) => setError(e?.message ?? "Failed to load settings — did you run the migration?"));
  }, []);

  async function handleSave() {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await saveLabSettings({
        router_model: routerModel.trim() || "gpt-5.4-mini",
        confidence_threshold: threshold,
        injection_cooldown_ms: cooldown,
        trigger_response: triggerResponse,
      });
      setNotice("Saved.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-white">Listener Settings</h2>
        <p className="text-[11px] text-gray-500">How aggressive the staff is about whispering.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-gray-400">Router Model</label>
          <input className={inputCls} value={routerModel} onChange={(e) => setRouterModel(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-400">Injection Cooldown (ms)</label>
          <input
            className={inputCls}
            type="number"
            step={500}
            value={cooldown}
            onChange={(e) => setCooldown(Number(e.target.value) || 0)}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-gray-400">
          Confidence Threshold: <span className="font-semibold text-gray-200">{threshold.toFixed(2)}</span>
          <span className="ml-1 text-gray-600">(below this, the agent handles it alone)</span>
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full accent-indigo-500"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={triggerResponse}
          onChange={(e) => setTriggerResponse(e.target.checked)}
        />
        Trigger immediate response on injection
        <span className="text-[10px] text-gray-600">
          (off = context-only; agent uses the note on its next natural turn — safer against double-talk)
        </span>
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {notice && <p className="text-xs text-emerald-400">{notice}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-700 disabled:opacity-40"
      >
        {saving ? "Saving..." : "Save Listener Settings"}
      </button>
    </div>
  );
}
