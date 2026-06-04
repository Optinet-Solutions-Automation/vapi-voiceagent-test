"use client";

import { useEffect, useState } from "react";

type ModelConfig = {
  provider: string | null;
  model: string | null;
  temperature: number | null;
};

type Server = { url?: string; timeoutSeconds?: number } | null;
type ArtifactPlan = { recordingFormat?: string } | null;
type Transcriber = { provider?: string; model?: string; language?: string } | null;
type VoicemailDetection = Record<string, unknown> | null;
type AnalysisPlan = {
  summaryPlan?: { enabled?: boolean; messages?: unknown[]; timeoutSeconds?: number };
  structuredDataPlan?: { enabled?: boolean; schema?: unknown; messages?: unknown[] };
  successEvaluationPlan?: { enabled?: boolean; rubric?: string; messages?: unknown[] };
} | null;

export type AssistantSettings = {
  name: string | null;
  firstMessage: string | null;
  firstMessageMode: string | null;
  voicemailMessage: string | null;
  endCallMessage: string | null;
  endCallPhrases: string[] | null;
  maxDurationSeconds: number | null;
  silenceTimeoutSeconds: number | null;
  responseDelaySeconds: number | null;
  backgroundSound: string | null;
  server: Server;
  artifactPlan: ArtifactPlan;
  voicemailDetection: VoicemailDetection;
  analysisPlan: AnalysisPlan;
  model: ModelConfig | null;
  transcriber: Transcriber;
};

type Props = {
  open: boolean;
  onClose: () => void;
  assistantId: string;
  assistantName: string;
  onSaved?: () => void;
};

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="space-y-2">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title}</p>
        {hint && <p className="text-[11px] text-gray-600">{hint}</p>}
      </div>
      <div className="space-y-2.5 rounded-lg border border-gray-700 bg-gray-900/50 p-3">
        {children}
      </div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-400">{label}</label>
      {children}
      {hint && <p className="mt-0.5 text-[10px] text-gray-600">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none disabled:opacity-50";

const taCls = inputCls + " resize-none";

export default function AssistantSettingsDrawer({
  open,
  onClose,
  assistantId,
  assistantName,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [voicemailMessage, setVoicemailMessage] = useState("");
  const [endCallMessage, setEndCallMessage] = useState("");
  const [endCallPhrases, setEndCallPhrases] = useState("");

  const [maxDuration, setMaxDuration] = useState<string>("");
  const [silenceTimeout, setSilenceTimeout] = useState<string>("");
  const [responseDelay, setResponseDelay] = useState<string>("");

  const [modelProvider, setModelProvider] = useState("");
  const [modelName, setModelName] = useState("");
  const [temperature, setTemperature] = useState<string>("");

  const [transcriberProvider, setTranscriberProvider] = useState("");
  const [transcriberModel, setTranscriberModel] = useState("");
  const [transcriberLanguage, setTranscriberLanguage] = useState("");

  const [serverUrl, setServerUrl] = useState("");
  const [serverTimeout, setServerTimeout] = useState<string>("");

  const [recordingFormat, setRecordingFormat] = useState("");

  const [voicemailDetectionRaw, setVoicemailDetectionRaw] = useState("");

  // Analysis plan / keypoints
  const [summaryEnabled, setSummaryEnabled] = useState(false);
  const [structuredEnabled, setStructuredEnabled] = useState(false);
  const [structuredSchemaText, setStructuredSchemaText] = useState("");
  const [structuredPrompt, setStructuredPrompt] = useState("");
  const [successEvalEnabled, setSuccessEvalEnabled] = useState(false);
  const [successEvalRubric, setSuccessEvalRubric] = useState("");
  const [successEvalPrompt, setSuccessEvalPrompt] = useState("");

  // Fetch settings when opened or assistantId changes
  useEffect(() => {
    if (!open || !assistantId) return;
    setLoading(true);
    setLoadError(null);
    fetch(`/api/vapi-assistant?assistantId=${assistantId}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? "Failed to load assistant");
        return j.settings as AssistantSettings;
      })
      .then((s) => {
        setName(s.name ?? "");
        setFirstMessage(s.firstMessage ?? "");
        setVoicemailMessage(s.voicemailMessage ?? "");
        setEndCallMessage(s.endCallMessage ?? "");
        setEndCallPhrases(Array.isArray(s.endCallPhrases) ? s.endCallPhrases.join(", ") : "");

        setMaxDuration(s.maxDurationSeconds != null ? String(s.maxDurationSeconds) : "");
        setSilenceTimeout(s.silenceTimeoutSeconds != null ? String(s.silenceTimeoutSeconds) : "");
        setResponseDelay(s.responseDelaySeconds != null ? String(s.responseDelaySeconds) : "");

        setModelProvider(s.model?.provider ?? "");
        setModelName(s.model?.model ?? "");
        setTemperature(s.model?.temperature != null ? String(s.model.temperature) : "");

        setTranscriberProvider(s.transcriber?.provider ?? "");
        setTranscriberModel(s.transcriber?.model ?? "");
        setTranscriberLanguage(s.transcriber?.language ?? "");

        setServerUrl(s.server?.url ?? "");
        setServerTimeout(s.server?.timeoutSeconds != null ? String(s.server.timeoutSeconds) : "");

        setRecordingFormat(s.artifactPlan?.recordingFormat ?? "");

        setVoicemailDetectionRaw(s.voicemailDetection ? JSON.stringify(s.voicemailDetection, null, 2) : "");

        const ap = s.analysisPlan ?? {};
        setSummaryEnabled(Boolean(ap.summaryPlan?.enabled));
        setStructuredEnabled(Boolean(ap.structuredDataPlan?.enabled));
        setStructuredSchemaText(
          ap.structuredDataPlan?.schema ? JSON.stringify(ap.structuredDataPlan.schema, null, 2) : ""
        );
        const sdSysMsg = Array.isArray(ap.structuredDataPlan?.messages)
          ? (ap.structuredDataPlan!.messages as Array<{ role?: string; content?: string }>).find((m) => m?.role === "system")
          : null;
        setStructuredPrompt(sdSysMsg?.content ?? "");
        setSuccessEvalEnabled(Boolean(ap.successEvaluationPlan?.enabled));
        setSuccessEvalRubric(ap.successEvaluationPlan?.rubric ?? "");
        const seSysMsg = Array.isArray(ap.successEvaluationPlan?.messages)
          ? (ap.successEvaluationPlan!.messages as Array<{ role?: string; content?: string }>).find((m) => m?.role === "system")
          : null;
        setSuccessEvalPrompt(seSysMsg?.content ?? "");
      })
      .catch((e) => setLoadError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [open, assistantId]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      // Build settings payload, sending undefined for fields the user blanked
      // out so VAPI can clear them. We only include a field if it's clearly
      // intentional (different from "" being treated as "no change").
      const settings: Record<string, unknown> = {};

      if (name.trim()) settings.name = name.trim();
      if (firstMessage !== "") settings.firstMessage = firstMessage;
      if (voicemailMessage !== "") settings.voicemailMessage = voicemailMessage;
      if (endCallMessage !== "") settings.endCallMessage = endCallMessage;

      const phrases = endCallPhrases.split(",").map((p) => p.trim()).filter(Boolean);
      if (phrases.length > 0) settings.endCallPhrases = phrases;

      const maxD = Number(maxDuration);
      if (maxDuration && Number.isFinite(maxD)) settings.maxDurationSeconds = maxD;

      const silT = Number(silenceTimeout);
      if (silenceTimeout && Number.isFinite(silT)) settings.silenceTimeoutSeconds = silT;

      const respD = Number(responseDelay);
      if (responseDelay && Number.isFinite(respD)) settings.responseDelaySeconds = respD;

      if (transcriberProvider || transcriberModel || transcriberLanguage) {
        settings.transcriber = {
          ...(transcriberProvider && { provider: transcriberProvider }),
          ...(transcriberModel && { model: transcriberModel }),
          ...(transcriberLanguage && { language: transcriberLanguage }),
        };
      }

      if (serverUrl) {
        const srv: Record<string, unknown> = { url: serverUrl };
        const sto = Number(serverTimeout);
        if (serverTimeout && Number.isFinite(sto)) srv.timeoutSeconds = sto;
        settings.server = srv;
      }

      if (recordingFormat) {
        settings.artifactPlan = { recordingFormat };
      }

      if (voicemailDetectionRaw.trim()) {
        try {
          settings.voicemailDetection = JSON.parse(voicemailDetectionRaw);
        } catch {
          throw new Error("Voicemail Detection: invalid JSON");
        }
      }

      // Analysis plan (keypoints)
      const analysisPlan: Record<string, unknown> = {};
      analysisPlan.summaryPlan = { enabled: summaryEnabled };

      const sdPlan: Record<string, unknown> = { enabled: structuredEnabled };
      if (structuredSchemaText.trim()) {
        try {
          sdPlan.schema = JSON.parse(structuredSchemaText);
        } catch {
          throw new Error("Structured Data Schema: invalid JSON");
        }
      }
      if (structuredPrompt.trim()) {
        sdPlan.messages = [
          { role: "system", content: structuredPrompt },
          {
            role: "user",
            content:
              "Here is the transcript:\n\n{{transcript}}\n\n. Here is the ended reason of the call:\n\n{{endedReason}}\n\n",
          },
        ];
      }
      analysisPlan.structuredDataPlan = sdPlan;

      const sePlan: Record<string, unknown> = { enabled: successEvalEnabled };
      if (successEvalRubric.trim()) sePlan.rubric = successEvalRubric.trim();
      if (successEvalPrompt.trim()) {
        sePlan.messages = [
          { role: "system", content: successEvalPrompt },
          {
            role: "user",
            content:
              "Here is the transcript of the call:\n\n{{transcript}}\n\n. Here is the ended reason of the call:\n\n{{endedReason}}\n\n",
          },
          { role: "user", content: "Here was the system prompt of the call:\n\n{{systemPrompt}}\n\n" },
        ];
      }
      analysisPlan.successEvaluationPlan = sePlan;

      settings.analysisPlan = analysisPlan;

      const modelConfig: Record<string, unknown> = {};
      if (modelProvider) modelConfig.provider = modelProvider;
      if (modelName) modelConfig.model = modelName;
      const tempN = Number(temperature);
      if (temperature && Number.isFinite(tempN)) modelConfig.temperature = tempN;

      const res = await fetch("/api/vapi-assistant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId,
          settings,
          ...(Object.keys(modelConfig).length > 0 && { modelConfig }),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Save failed (${res.status})`);
      }
      onSaved?.();
      onClose();
    } catch (e: any) {
      setSaveError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full w-full max-w-2xl flex-col border-l border-gray-700 bg-gray-900 shadow-2xl"
      >
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-gray-800 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white">Assistant Settings</h2>
            <p className="truncate text-xs text-gray-500">{assistantName}</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded p-1 text-gray-400 hover:text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {loading && <p className="py-10 text-center text-sm text-gray-500">Loading settings...</p>}
          {loadError && <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{loadError}</p>}

          {!loading && !loadError && (
            <>
              <Section title="Basics" hint="Identity and opening line">
                <Field label="Agent Name">
                  <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="First Message" hint="What the agent says at the start of the call.">
                  <textarea className={taCls} rows={2} value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)} />
                </Field>
                <Field label="End Call Message" hint="What the agent says when ending the call.">
                  <textarea className={taCls} rows={2} value={endCallMessage} onChange={(e) => setEndCallMessage(e.target.value)} />
                </Field>
                <Field label="End Call Phrases" hint="Comma-separated phrases that trigger the call to end.">
                  <input className={inputCls} value={endCallPhrases} onChange={(e) => setEndCallPhrases(e.target.value)} placeholder="goodbye, bye, talk later" />
                </Field>
                <Field label="Voicemail Message" hint="Played if a voicemail is detected.">
                  <textarea className={taCls} rows={2} value={voicemailMessage} onChange={(e) => setVoicemailMessage(e.target.value)} />
                </Field>
              </Section>

              <Section title="Model" hint="LLM provider, model name, and temperature">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Provider">
                    <input className={inputCls} value={modelProvider} onChange={(e) => setModelProvider(e.target.value)} placeholder="openai" />
                  </Field>
                  <Field label="Model">
                    <input className={inputCls} value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="gpt-4o" />
                  </Field>
                </div>
                <Field label="Temperature" hint="0 = deterministic, 1 = balanced, 2 = chaotic.">
                  <input className={inputCls} type="number" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
                </Field>
              </Section>

              <Section title="Transcriber" hint="Speech-to-text provider">
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Provider"><input className={inputCls} value={transcriberProvider} onChange={(e) => setTranscriberProvider(e.target.value)} placeholder="deepgram" /></Field>
                  <Field label="Model"><input className={inputCls} value={transcriberModel} onChange={(e) => setTranscriberModel(e.target.value)} placeholder="nova-2" /></Field>
                  <Field label="Language"><input className={inputCls} value={transcriberLanguage} onChange={(e) => setTranscriberLanguage(e.target.value)} placeholder="en" /></Field>
                </div>
              </Section>

              <Section title="Timing & Limits" hint="All values in seconds">
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Max Duration"><input className={inputCls} type="number" value={maxDuration} onChange={(e) => setMaxDuration(e.target.value)} placeholder="600" /></Field>
                  <Field label="Silence Timeout"><input className={inputCls} type="number" value={silenceTimeout} onChange={(e) => setSilenceTimeout(e.target.value)} placeholder="30" /></Field>
                  <Field label="Response Delay"><input className={inputCls} type="number" step="0.1" value={responseDelay} onChange={(e) => setResponseDelay(e.target.value)} placeholder="0.4" /></Field>
                </div>
              </Section>

              <Section title="Recording" hint="Artifact format VAPI writes to S3">
                <Field label="Recording Format" hint="mp3, wav, or leave empty for VAPI default">
                  <input className={inputCls} value={recordingFormat} onChange={(e) => setRecordingFormat(e.target.value)} placeholder="mp3" />
                </Field>
              </Section>

              <Section title="Webhook" hint="Where VAPI POSTs call events">
                <Field label="Server URL">
                  <input className={inputCls} value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://example.com/vapi-webhook" />
                </Field>
                <Field label="Server Timeout (seconds)">
                  <input className={inputCls} type="number" value={serverTimeout} onChange={(e) => setServerTimeout(e.target.value)} placeholder="20" />
                </Field>
              </Section>

              <Section title="Voicemail Detection" hint="Raw JSON config — leave empty to disable">
                <textarea className={taCls + " font-mono text-[11px]"} rows={4} value={voicemailDetectionRaw} onChange={(e) => setVoicemailDetectionRaw(e.target.value)} placeholder='{"provider":"twilio","enabled":true}' />
              </Section>

              <Section
                title="Analysis Plan / Keypoints"
                hint="Post-call AI analysis: summary, structured data extraction, success scoring"
              >
                <div className="rounded border border-gray-700 bg-gray-800/40 p-2.5">
                  <label className="flex items-center gap-2 text-sm text-gray-200">
                    <input type="checkbox" checked={summaryEnabled} onChange={(e) => setSummaryEnabled(e.target.checked)} />
                    Summary enabled
                  </label>
                </div>

                <div className="rounded border border-gray-700 bg-gray-800/40 p-2.5 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-200">
                    <input type="checkbox" checked={structuredEnabled} onChange={(e) => setStructuredEnabled(e.target.checked)} />
                    Structured Data Extraction (keypoints)
                  </label>
                  <Field label="JSON Schema" hint="Define which keypoints the LLM should extract from the call">
                    <textarea
                      className={taCls + " font-mono text-[11px]"}
                      rows={6}
                      value={structuredSchemaText}
                      onChange={(e) => setStructuredSchemaText(e.target.value)}
                      placeholder='{"type":"object","properties":{"optOut":{"type":"boolean","description":"…"}}}'
                    />
                  </Field>
                  <Field label="System Prompt" hint="Instructions for the extractor LLM. Use {{schema}} and {{transcript}} placeholders.">
                    <textarea
                      className={taCls}
                      rows={4}
                      value={structuredPrompt}
                      onChange={(e) => setStructuredPrompt(e.target.value)}
                    />
                  </Field>
                </div>

                <div className="rounded border border-gray-700 bg-gray-800/40 p-2.5 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-200">
                    <input type="checkbox" checked={successEvalEnabled} onChange={(e) => setSuccessEvalEnabled(e.target.checked)} />
                    Success Evaluation
                  </label>
                  <Field label="Rubric" hint="Built-in rubric, e.g. AutomaticRubric, PassFail, NumericScale, etc.">
                    <input className={inputCls} value={successEvalRubric} onChange={(e) => setSuccessEvalRubric(e.target.value)} placeholder="AutomaticRubric" />
                  </Field>
                  <Field label="System Prompt" hint="Instructions for the evaluator LLM. Use {{rubric}} and {{transcript}} placeholders.">
                    <textarea className={taCls} rows={4} value={successEvalPrompt} onChange={(e) => setSuccessEvalPrompt(e.target.value)} />
                  </Field>
                </div>
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-800 px-5 py-4">
          {saveError && <p className="mb-2 text-xs text-red-400">{saveError}</p>}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || !!loadError}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save All"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
