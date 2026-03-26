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

// PATCH /api/vapi-assistant — update the assistant system prompt
export async function PATCH(req: Request) {
  const { systemPrompt } = await req.json();
  if (typeof systemPrompt !== "string") {
    return NextResponse.json({ error: "systemPrompt is required" }, { status: 400 });
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
  const model = assistant?.model ?? {};
  const existingMessages: Array<{ role: string; content: string }> =
    model.messages ?? [];

  // Replace or insert the system message
  const hasSystem = existingMessages.some((m) => m.role === "system");
  const newMessages = hasSystem
    ? existingMessages.map((m) =>
        m.role === "system" ? { ...m, content: systemPrompt } : m
      )
    : [{ role: "system", content: systemPrompt }, ...existingMessages];

  const patchRes = await fetch(`${VAPI_BASE}/assistant/${VAPI_ASSISTANT_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${VAPI_PRIVATE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: { ...model, messages: newMessages } }),
  });

  if (!patchRes.ok) {
    const text = await patchRes.text();
    return NextResponse.json({ error: text }, { status: patchRes.status });
  }

  return NextResponse.json({ ok: true });
}
