// One-click "Configure for Lab": attaches tools, serverMessages, server.url and
// monitorPlan to the chosen assistant so the listener loop can run.
import { NextResponse } from "next/server";
import { LAB_TOOLS, LAB_OPERATING_RULES, DEFAULT_SHORT_PROMPT } from "@/lib/lab-tools";
import { getLabSettings, saveLabSettings, listHandlers } from "@/lib/lab-db";

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

  // The system prompt is COMPOSED, not written: the campaign persona comes
  // from the Playbook's special "identity" scenario (editable next to the
  // opening line, swapped per campaign like any other data), falling back to
  // lab_settings.short_prompt; the universal listener operating rules are
  // appended so campaigns never duplicate mechanics. Identity must be
  // standing prompt material — on un-injected turns an agent with no identity
  // invents one (the "BrightPath" incident).
  const identityScenario = await listHandlers()
    .then((hs) => hs.find((h) => h.intent_key === "identity" && h.enabled))
    .catch(() => undefined);
  const persona =
    identityScenario?.response_template?.trim() || settings?.short_prompt?.trim() || DEFAULT_SHORT_PROMPT;
  // The wait-phrase ban is bookended: first line of the prompt AND inside the
  // hard rules — it kept leaking from an end-only position.
  const prompt = `ABSOLUTE RULE — never say "hold on", "hold on a sec", "one moment", "just a sec", "just a moment", "give me a second", "please hold" or any wait-phrase, in any situation, ever. If you need a beat: one tiny casual filler ("mm-hmm", "okay so—") or silence.\n\n${persona}\n\n${LAB_OPERATING_RULES}`;

  const model = assistant.model ?? {};
  let messages: Array<{ role: string; content: string }> = model.messages ?? [];
  const hasSystem = messages.some((m) => m.role === "system");
  messages = hasSystem
    ? messages.map((m) => (m.role === "system" ? { ...m, content: prompt } : m))
    : [{ role: "system", content: prompt }, ...messages];

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
      idleTimeoutSeconds: 10,
      idleMessageMaxSpokenCount: 2,
    },
    // Interruptions are analyzed, not knee-jerk: acknowledgements and noise
    // never stop the agent; three or more words do; explicit interruption
    // words ("stop", "wait") cut through instantly.
    stopSpeakingPlan: {
      numWords: 3,
      backoffSeconds: 1,
      acknowledgementPhrases: [
        "okay", "ok", "yeah", "yes", "uh-huh", "mm-hmm", "mhm", "right",
        "sure", "got it", "i see", "alright", "gotcha", "cool", "i hear you",
      ],
      interruptionPhrases: ["stop", "wait", "hold on", "no no", "excuse me", "actually", "question"],
    },
    // Wait for the customer to actually finish before replying (smart
    // endpointing coalesces split finals) — but keep the wait short: fillers
    // only buy time if they start the instant the customer stops, and the
    // supersede/lock guards already handle fragment stragglers.
    startSpeakingPlan: { waitSeconds: 0.5, smartEndpointingPlan: { provider: "vapi" } },
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
