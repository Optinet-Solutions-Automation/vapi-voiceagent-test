import { NextResponse } from "next/server";

const FALLBACK_ASSISTANT_ID = "509156f5-78b7-4644-901a-acbc3415472d";
const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY!;
const VAPI_BASE = "https://api.vapi.ai";

// GET /api/vapi-assistant?assistantId=xxx
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const assistantId = searchParams.get("assistantId") ?? FALLBACK_ASSISTANT_ID;

  const res = await fetch(`${VAPI_BASE}/assistant/${assistantId}`, {
    headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: res.status });
  }

  const assistant = await res.json();

  let systemPrompt: string | null = null;
  const messages: Array<{ role: string; content: string }> = assistant?.model?.messages ?? [];
  const systemMsg = messages.find((m) => m.role === "system");
  if (systemMsg) systemPrompt = systemMsg.content;
  else if (assistant?.model?.systemPrompt) systemPrompt = assistant.model.systemPrompt;

  // Surface the editable subset to the client.
  const settings = {
    name: assistant?.name ?? null,
    firstMessage: assistant?.firstMessage ?? null,
    firstMessageMode: assistant?.firstMessageMode ?? null,
    voicemailMessage: assistant?.voicemailMessage ?? null,
    endCallMessage: assistant?.endCallMessage ?? null,
    endCallPhrases: assistant?.endCallPhrases ?? null,
    maxDurationSeconds: assistant?.maxDurationSeconds ?? null,
    silenceTimeoutSeconds: assistant?.silenceTimeoutSeconds ?? null,
    responseDelaySeconds: assistant?.responseDelaySeconds ?? null,
    backgroundSound: assistant?.backgroundSound ?? null,
    server: assistant?.server ?? null,
    artifactPlan: assistant?.artifactPlan ?? null,
    voicemailDetection: assistant?.voicemailDetection ?? null,
    analysisPlan: assistant?.analysisPlan ?? null,
    model: assistant?.model
      ? {
          provider: assistant.model.provider ?? null,
          model: assistant.model.model ?? null,
          temperature: assistant.model.temperature ?? null,
        }
      : null,
    transcriber: assistant?.transcriber ?? null,
  };

  return NextResponse.json({ systemPrompt, assistant, settings });
}

// Allowlisted top-level assistant fields the client may PATCH.
const ALLOWED_FIELDS = new Set([
  "name",
  "firstMessage",
  "firstMessageMode",
  "voicemailMessage",
  "endCallMessage",
  "endCallPhrases",
  "maxDurationSeconds",
  "silenceTimeoutSeconds",
  "responseDelaySeconds",
  "backgroundSound",
  "server",
  "serverMessages",
  "monitorPlan",
  "artifactPlan",
  "voicemailDetection",
  "analysisPlan",
  "transcriber",
]);

// PATCH /api/vapi-assistant — body supports:
//   { assistantId?, systemPrompt?, voice?, modelConfig?: { provider?, model?, temperature? }, settings?: Record<string, unknown> }
export async function PATCH(req: Request) {
  const body = await req.json();
  const {
    assistantId: bodyId,
    systemPrompt,
    voice,
    modelConfig,
    settings,
  } = body as {
    assistantId?: string;
    systemPrompt?: string;
    voice?: { provider: string; voiceId: string };
    modelConfig?: { provider?: string; model?: string; temperature?: number };
    settings?: Record<string, unknown>;
  };

  const assistantId = bodyId ?? FALLBACK_ASSISTANT_ID;

  const wantsSystemPrompt = systemPrompt !== undefined;
  const wantsVoice = voice !== undefined;
  const wantsModelConfig = modelConfig !== undefined && Object.keys(modelConfig).length > 0;
  const wantsSettings = settings !== undefined && Object.keys(settings).length > 0;

  if (!wantsSystemPrompt && !wantsVoice && !wantsModelConfig && !wantsSettings) {
    return NextResponse.json(
      { error: "Provide at least one of: systemPrompt, voice, modelConfig, settings" },
      { status: 400 }
    );
  }

  // We have to read the current assistant to preserve fields we don't touch
  // (notably model.messages when patching model.provider/model/temperature, since
  // VAPI's model object is replaced wholesale on PATCH).
  const getRes = await fetch(`${VAPI_BASE}/assistant/${assistantId}`, {
    headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}` },
  });

  if (!getRes.ok) {
    const text = await getRes.text();
    return NextResponse.json({ error: text }, { status: getRes.status });
  }

  const assistant = await getRes.json();
  const patchBody: Record<string, unknown> = {};

  if (wantsSystemPrompt && typeof systemPrompt === "string") {
    const model = assistant?.model ?? {};
    const existingMessages: Array<{ role: string; content: string }> = model.messages ?? [];
    const hasSystem = existingMessages.some((m) => m.role === "system");
    const newMessages = hasSystem
      ? existingMessages.map((m) =>
          m.role === "system" ? { ...m, content: systemPrompt } : m
        )
      : [{ role: "system", content: systemPrompt }, ...existingMessages];
    patchBody.model = { ...model, messages: newMessages };
  }

  if (wantsVoice && voice) {
    patchBody.voice = voice;
  }

  if (wantsModelConfig && modelConfig) {
    const existingModel = (patchBody.model as Record<string, unknown>) ?? assistant?.model ?? {};
    patchBody.model = {
      ...existingModel,
      ...(modelConfig.provider ? { provider: modelConfig.provider } : {}),
      ...(modelConfig.model ? { model: modelConfig.model } : {}),
      ...(typeof modelConfig.temperature === "number"
        ? { temperature: modelConfig.temperature }
        : {}),
    };
  }

  if (wantsSettings && settings) {
    for (const [k, v] of Object.entries(settings)) {
      if (ALLOWED_FIELDS.has(k)) {
        patchBody[k] = v;
      }
    }
  }

  const patchRes = await fetch(`${VAPI_BASE}/assistant/${assistantId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${VAPI_PRIVATE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patchBody),
  });

  if (!patchRes.ok) {
    const text = await patchRes.text();
    return NextResponse.json({ error: text }, { status: patchRes.status });
  }

  return NextResponse.json({ ok: true });
}
