// One-click "Configure for Lab": attaches tools, serverMessages, server.url and
// monitorPlan to the chosen assistant so the listener loop can run.
import { NextResponse } from "next/server";
import { LAB_TOOLS } from "@/lib/lab-tools";
import { getLabSettings, saveLabSettings } from "@/lib/lab-db";

const VAPI_BASE = "https://api.vapi.ai";

export async function POST(req: Request) {
  const apiKey = process.env.VAPI_PRIVATE_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "VAPI_PRIVATE_KEY not configured" }, { status: 500 });
  }

  const { assistantId } = (await req.json()) as { assistantId?: string };
  if (!assistantId) {
    return NextResponse.json({ error: "assistantId required" }, { status: 400 });
  }

  const settings = await getLabSettings().catch(() => null);
  const base =
    settings?.server_url_override?.trim() || process.env.LAB_WEBHOOK_BASE_URL || "";
  if (!base) {
    return NextResponse.json(
      {
        error:
          "No webhook base URL. Set the Server URL override in Lab Settings (e.g. your ngrok URL) or set LAB_WEBHOOK_BASE_URL in the environment.",
      },
      { status: 400 }
    );
  }
  // Users tend to paste full page URLs (e.g. .../listener-lab) — keep only the origin.
  let origin: string;
  try {
    origin = new URL(base.includes("://") ? base : `https://${base}`).origin;
  } catch {
    return NextResponse.json({ error: `Invalid webhook base URL: ${base}` }, { status: 400 });
  }
  const webhookUrl = `${origin}/api/lab/webhook`;

  // GET current assistant to preserve model.messages etc.
  const getRes = await fetch(`${VAPI_BASE}/assistant/${assistantId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!getRes.ok) {
    const text = await getRes.text();
    return NextResponse.json({ error: text }, { status: getRes.status });
  }
  const assistant = await getRes.json();

  // Push the persona prompt from lab settings too — a stale assistant prompt
  // ("still the old brand") kept haunting test calls when only the settings
  // row had been updated.
  const model = assistant.model ?? {};
  let messages: Array<{ role: string; content: string }> = model.messages ?? [];
  const prompt = settings?.short_prompt?.trim();
  if (prompt) {
    const hasSystem = messages.some((m) => m.role === "system");
    messages = hasSystem
      ? messages.map((m) => (m.role === "system" ? { ...m, content: prompt } : m))
      : [{ role: "system", content: prompt }, ...messages];
  }

  const patchBody = {
    model: { ...model, messages, tools: LAB_TOOLS },
    server: { url: webhookUrl, timeoutSeconds: 20 },
    serverMessages: [
      "tool-calls",
      "transcript",
      "status-update",
      "end-of-call-report",
    ],
    monitorPlan: { listenEnabled: true, controlEnabled: true },
    // Dead-air plan: the whole listener loop is transcript-driven, so customer
    // silence otherwise means nothing ever happens. These re-engage naturally,
    // at most twice, without sounding like a stuck record.
    messagePlan: {
      idleMessages: [
        "Take your time — I'm still here.",
        "Are you still with me?",
        "No pressure — want me to go over that again?",
      ],
      idleTimeoutSeconds: 8,
      idleMessageMaxSpokenCount: 2,
    },
  };

  const patchRes = await fetch(`${VAPI_BASE}/assistant/${assistantId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(patchBody),
  });
  if (!patchRes.ok) {
    const text = await patchRes.text();
    return NextResponse.json({ error: text }, { status: patchRes.status });
  }

  await saveLabSettings({ lab_assistant_id: assistantId }).catch(() => {});

  return NextResponse.json({
    ok: true,
    assistantId,
    assistantName: assistant.name ?? null,
    webhookUrl,
    toolCount: LAB_TOOLS.length,
  });
}

// GET returns the env default so the UI can display it
export async function GET() {
  return NextResponse.json({
    envBaseUrl: process.env.LAB_WEBHOOK_BASE_URL ?? null,
  });
}
