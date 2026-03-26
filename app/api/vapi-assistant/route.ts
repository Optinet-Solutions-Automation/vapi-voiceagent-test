import { NextResponse } from "next/server";

const VAPI_ASSISTANT_ID = "509156f5-78b7-4644-901a-acbc3415472d";
const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY!;
const VAPI_BASE = "https://api.vapi.ai";

// GET /api/vapi-assistant — fetch the current assistant system prompt
export async function GET() {
  const res = await fetch(`${VAPI_BASE}/assistant/${VAPI_ASSISTANT_ID}`, {
    headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: res.status });
  }

  const assistant = await res.json();

  // System prompt can be in model.messages[role=system] or model.systemPrompt
  let systemPrompt: string | null = null;

  const messages: Array<{ role: string; content: string }> =
    assistant?.model?.messages ?? [];
  const systemMsg = messages.find((m) => m.role === "system");
  if (systemMsg) {
    systemPrompt = systemMsg.content;
  } else if (assistant?.model?.systemPrompt) {
    systemPrompt = assistant.model.systemPrompt;
  }

  return NextResponse.json({ systemPrompt, assistant });
}

// PATCH /api/vapi-assistant — update the assistant system prompt and/or voice
export async function PATCH(req: Request) {
  const body = await req.json();
  const { systemPrompt, voice } = body as {
    systemPrompt?: string;
    voice?: { provider: string; voiceId: string };
  };

  if (systemPrompt === undefined && voice === undefined) {
    return NextResponse.json({ error: "systemPrompt or voice is required" }, { status: 400 });
  }

  // First fetch the current assistant to preserve all other fields
  const getRes = await fetch(`${VAPI_BASE}/assistant/${VAPI_ASSISTANT_ID}`, {
    headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}` },
  });

  if (!getRes.ok) {
    const text = await getRes.text();
    return NextResponse.json({ error: text }, { status: getRes.status });
  }

  const assistant = await getRes.json();
  const patchBody: Record<string, unknown> = {};

  // Update system prompt if provided
  if (typeof systemPrompt === "string") {
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

  // Update voice if provided
  if (voice) {
    patchBody.voice = voice;
  }

  const patchRes = await fetch(`${VAPI_BASE}/assistant/${VAPI_ASSISTANT_ID}`, {
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
