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

  return NextResponse.json({ systemPrompt, assistant });
}

// PATCH /api/vapi-assistant — body: { assistantId?, systemPrompt?, voice? }
export async function PATCH(req: Request) {
  const body = await req.json();
  const { assistantId: bodyId, systemPrompt, voice } = body as {
    assistantId?: string;
    systemPrompt?: string;
    voice?: { provider: string; voiceId: string };
  };

  const assistantId = bodyId ?? FALLBACK_ASSISTANT_ID;

  if (systemPrompt === undefined && voice === undefined) {
    return NextResponse.json({ error: "systemPrompt or voice is required" }, { status: 400 });
  }

  const getRes = await fetch(`${VAPI_BASE}/assistant/${assistantId}`, {
    headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}` },
  });

  if (!getRes.ok) {
    const text = await getRes.text();
    return NextResponse.json({ error: text }, { status: getRes.status });
  }

  const assistant = await getRes.json();
  const patchBody: Record<string, unknown> = {};

  if (typeof systemPrompt === "string") {
    const model = assistant?.model ?? {};
    const existingMessages: Array<{ role: string; content: string }> = model.messages ?? [];
    const hasSystem = existingMessages.some((m) => m.role === "system");
    const newMessages = hasSystem
      ? existingMessages.map((m) => m.role === "system" ? { ...m, content: systemPrompt } : m)
      : [{ role: "system", content: systemPrompt }, ...existingMessages];
    patchBody.model = { ...model, messages: newMessages };
  }

  if (voice) patchBody.voice = voice;

  const patchRes = await fetch(`${VAPI_BASE}/assistant/${assistantId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(patchBody),
  });

  if (!patchRes.ok) {
    const text = await patchRes.text();
    return NextResponse.json({ error: text }, { status: patchRes.status });
  }

  return NextResponse.json({ ok: true });
}
