// VAPI server webhook for the Listener Lab assistant.
// Receives mid-call events (tool-calls, live transcript chunks, status updates)
// and runs the organizer: classify utterances, resolve handlers, inject answers.
import { NextResponse } from "next/server";
import {
  listHandlers,
  getLabSettings,
  insertLabEvent,
  getLastInjectedEvent,
} from "@/lib/lab-db";
import { classifyUtterance } from "@/lib/lab-router";
import {
  getControlUrl,
  injectStaffNote,
  injectSay,
  endCall,
} from "@/lib/lab-control";
import type { ListenerHandler } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type VapiMessage = {
  type?: string;
  call?: { id?: string; monitor?: { controlUrl?: string } };
  // transcript events
  role?: string;
  transcriptType?: string;
  transcript?: string;
  timestamp?: number;
  // tool calls
  toolCallList?: Array<{
    id: string;
    function?: { name?: string; arguments?: unknown };
    name?: string;
    arguments?: unknown;
  }>;
  toolCalls?: Array<{
    id: string;
    function?: { name?: string; arguments?: unknown };
    name?: string;
    arguments?: unknown;
  }>;
  // misc
  status?: string;
  endedReason?: string;
  artifact?: { messages?: Array<{ role?: string; message?: string; content?: string }> };
};

function safeArgs(args: unknown): Record<string, unknown> {
  if (!args) return {};
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }
  if (typeof args === "object") return args as Record<string, unknown>;
  return {};
}

async function log(event: Parameters<typeof insertLabEvent>[0]) {
  try {
    await insertLabEvent(event);
  } catch (e) {
    console.error("[lab webhook] failed to log event:", e);
  }
}

export async function POST(req: Request) {
  let message: VapiMessage;
  try {
    const body = await req.json();
    message = body?.message ?? {};
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const callId = message.call?.id ?? "unknown";
  const controlUrlHint = message.call?.monitor?.controlUrl ?? null;

  switch (message.type) {
    case "tool-calls":
      return handleToolCalls(message, callId, controlUrlHint);

    case "transcript":
      await handleTranscript(message, callId, controlUrlHint);
      return NextResponse.json({});

    case "status-update":
      await log({
        call_id: callId,
        event_type: "status",
        content: message.status ?? null,
        meta: { controlUrl: controlUrlHint, endedReason: message.endedReason ?? null },
      });
      return NextResponse.json({});

    case "speech-update":
      // High-volume; log only start/stop transitions lightly
      await log({
        call_id: callId,
        event_type: "status",
        content: `speech-update: ${(message as Record<string, unknown>).status ?? ""} (${message.role ?? ""})`,
      });
      return NextResponse.json({});

    case "end-of-call-report":
      await log({
        call_id: callId,
        event_type: "status",
        content: "end-of-call-report",
        meta: { endedReason: message.endedReason ?? null },
      });
      return NextResponse.json({});

    default:
      return NextResponse.json({});
  }
}

// ── Rung 1: tools (agent pulls) ───────────────────────────────

async function handleToolCalls(
  message: VapiMessage,
  callId: string,
  controlUrlHint: string | null
) {
  const receivedAt = Date.now();
  const rawCalls = message.toolCallList ?? message.toolCalls ?? [];
  const results: Array<{ toolCallId: string; result: string }> = [];

  let handlers: ListenerHandler[] = [];
  let routerModel = "gpt-5.4-mini";
  try {
    const [hs, settings] = await Promise.all([listHandlers(), getLabSettings()]);
    handlers = hs.filter(
      (h) =>
        h.enabled &&
        h.intent_key !== "first_message" && // special: opening line, never routed
        (h.mode === "tool" || h.mode === "both")
    );
    if (settings?.router_model) routerModel = settings.router_model;
  } catch (e) {
    console.error("[lab webhook] failed to load handlers/settings:", e);
  }

  for (const tc of rawCalls) {
    const name = tc.function?.name ?? tc.name ?? "";
    const args = safeArgs(tc.function?.arguments ?? tc.arguments);
    await log({
      call_id: callId,
      event_type: "tool_call",
      content: name,
      meta: { args, toolCallId: tc.id },
    });

    let result = "No information available. Offer to follow up later.";
    let handlerId: string | null = null;
    let actionType: string | null = null;

    try {
      if (name === "lookup_answer") {
        const question = String(args.question ?? "");
        if (question && handlers.length > 0) {
          const cls = await classifyUtterance(question, [], handlers, routerModel);
          const match = handlers.find((h) => h.intent_key === cls.intent);
          if (match) {
            result = match.response_template || "No details configured for this topic yet.";
            handlerId = match.id;
            actionType = match.action_type;
          } else {
            result = "I don't have that information. Offer to follow up with details later.";
          }
        }
      } else if (name === "get_offer") {
        const offer = handlers
          .filter((h) => h.action_type === "give_offer")
          .sort((a, b) => a.priority - b.priority)[0];
        if (offer) {
          result = offer.response_template || "No offer configured.";
          handlerId = offer.id;
          actionType = offer.action_type;
        } else {
          result = "No current offer configured. Steer the conversation politely.";
        }
      } else if (name === "send_sms") {
        const smsHandler = handlers
          .filter((h) => h.action_type === "send_sms")
          .sort((a, b) => a.priority - b.priority)[0];
        handlerId = smsHandler?.id ?? null;
        actionType = "send_sms";
        // Lab only logs the SMS — no real send.
        result = "SMS queued successfully. Tell the customer it has been sent.";
      } else if (name === "end_call_goodbye") {
        actionType = "end_call";
        result = "Say a brief, warm goodbye now.";
        // End the call shortly after the goodbye; fire-and-forget.
        const controlUrl = await getControlUrl(callId, controlUrlHint);
        if (controlUrl) {
          setTimeout(() => {
            endCall(controlUrl).catch(() => {});
          }, 4000);
        }
      }
    } catch (e: unknown) {
      await log({
        call_id: callId,
        event_type: "error",
        content: `tool ${name} failed`,
        meta: { error: e instanceof Error ? e.message : String(e) },
      });
    }

    await log({
      call_id: callId,
      event_type: "tool_result",
      content: result,
      handler_id: handlerId,
      action_type: actionType,
      latency_ms: Date.now() - receivedAt,
      meta: { tool: name, toolCallId: tc.id },
    });

    results.push({ toolCallId: tc.id, result });
  }

  return NextResponse.json({ results });
}

// ── Rung 2: live listener (staff pushes) ──────────────────────

async function handleTranscript(
  message: VapiMessage,
  callId: string,
  controlUrlHint: string | null
) {
  // Only final customer utterances
  if (message.role !== "user" || message.transcriptType !== "final") return;
  const utterance = (message.transcript ?? "").trim();
  if (!utterance) return;

  const receivedAt = Date.now();
  const utteranceAt =
    typeof message.timestamp === "number" ? new Date(message.timestamp) : new Date(receivedAt);

  await log({
    call_id: callId,
    event_type: "utterance",
    role: "user",
    content: utterance,
    utterance_at: utteranceAt.toISOString(),
  });

  let settings;
  let handlers: ListenerHandler[] = [];
  try {
    const [s, hs] = await Promise.all([getLabSettings(), listHandlers()]);
    settings = s;
    handlers = hs.filter(
      (h) =>
        h.enabled &&
        h.intent_key !== "first_message" && // special: opening line, never routed
        (h.mode === "listener" || h.mode === "both")
    );
  } catch (e) {
    await log({
      call_id: callId,
      event_type: "error",
      content: "failed to load settings/handlers",
      meta: { error: e instanceof Error ? e.message : String(e) },
    });
    return;
  }

  if (!settings || handlers.length === 0) {
    await log({
      call_id: callId,
      event_type: "skipped",
      content: utterance,
      meta: { reason: handlers.length === 0 ? "no_handlers" : "no_settings" },
    });
    return;
  }

  // Cooldown: don't whisper twice in rapid succession
  try {
    const last = await getLastInjectedEvent(callId);
    if (last?.injected_at) {
      const elapsed = receivedAt - new Date(last.injected_at).getTime();
      if (elapsed < settings.injection_cooldown_ms) {
        await log({
          call_id: callId,
          event_type: "skipped",
          content: utterance,
          meta: { reason: "cooldown", elapsed_ms: elapsed },
        });
        return;
      }
    }
  } catch {
    /* non-fatal */
  }

  // Classify
  let cls;
  try {
    cls = await classifyUtterance(utterance, [], handlers, settings.router_model);
  } catch (e) {
    await log({
      call_id: callId,
      event_type: "error",
      content: "router failed",
      meta: { error: e instanceof Error ? e.message : String(e) },
    });
    return;
  }
  const classifiedAt = Date.now();

  await log({
    call_id: callId,
    event_type: "classified",
    content: utterance,
    intent_key: cls.intent,
    confidence: cls.confidence,
    utterance_at: utteranceAt.toISOString(),
    classified_at: new Date(classifiedAt).toISOString(),
    meta: { raw: cls.raw },
  });

  // Decision gate — the conflict protocol
  if (cls.intent === "none" || cls.confidence < settings.confidence_threshold) {
    await log({
      call_id: callId,
      event_type: "skipped",
      content: utterance,
      intent_key: cls.intent,
      confidence: cls.confidence,
      meta: { reason: cls.intent === "none" ? "intent_none" : "below_threshold" },
    });
    return;
  }

  const handler = handlers.find((h) => h.intent_key === cls.intent);
  if (!handler || handler.action_type === "ignore") {
    await log({
      call_id: callId,
      event_type: "skipped",
      content: utterance,
      intent_key: cls.intent,
      confidence: cls.confidence,
      handler_id: handler?.id ?? null,
      meta: { reason: handler ? "handler_ignore" : "handler_not_found" },
    });
    return;
  }

  // Inject
  const controlUrl = await getControlUrl(callId, controlUrlHint);
  if (!controlUrl) {
    await log({
      call_id: callId,
      event_type: "error",
      content: "no controlUrl available",
      intent_key: cls.intent,
      handler_id: handler.id,
    });
    return;
  }

  try {
    let injectResult;
    let injectedText = handler.response_template;

    if (handler.action_type === "end_call") {
      injectedText = handler.response_template || "Thanks for your time today. Goodbye!";
      injectResult = await injectSay(controlUrl, injectedText, true);
      if (!injectResult.ok) {
        // Fallback: plain say then explicit end-call
        injectResult = await injectSay(controlUrl, injectedText, false);
        setTimeout(() => {
          endCall(controlUrl).catch(() => {});
        }, 4000);
      }
    } else if (handler.action_type === "send_sms") {
      injectedText =
        "The SMS with the details has been sent. Confirm to the customer it's on its way.";
      injectResult = await injectStaffNote(controlUrl, injectedText, settings.trigger_response);
    } else {
      // answer / give_offer
      injectResult = await injectStaffNote(controlUrl, injectedText, settings.trigger_response);
    }

    const injectedAtMs = Date.now();
    await log({
      call_id: callId,
      event_type: "injected",
      content: injectedText,
      intent_key: cls.intent,
      confidence: cls.confidence,
      handler_id: handler.id,
      action_type: handler.action_type,
      utterance_at: utteranceAt.toISOString(),
      classified_at: new Date(classifiedAt).toISOString(),
      injected_at: new Date(injectedAtMs).toISOString(),
      latency_ms: injectedAtMs - utteranceAt.getTime(),
      meta: { controlStatus: injectResult.status, controlOk: injectResult.ok },
    });
  } catch (e) {
    await log({
      call_id: callId,
      event_type: "error",
      content: "injection failed",
      intent_key: cls.intent,
      handler_id: handler.id,
      meta: { error: e instanceof Error ? e.message : String(e) },
    });
  }
}
