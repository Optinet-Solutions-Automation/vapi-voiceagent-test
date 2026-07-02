// VAPI server webhook for the Listener Lab assistant.
// Receives mid-call events (tool-calls, live transcript chunks, status updates)
// and runs the organizer: classify utterances, resolve handlers, inject answers.
import { NextResponse } from "next/server";
import {
  listHandlers,
  getLabSettings,
  insertLabEvent,
  insertLabEventReturningId,
  hasNewerUtterance,
  getLastInjectedEvent,
  getRecentTurns,
  getCollectionHandlerIds,
  getScriptGraph,
  getFlowState,
  persistFlowStateGuarded,
} from "@/lib/lab-db";
import { findEntryNode, nodeById, pickNextEdge, contentTypeOf } from "@/lib/lab-flow";
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

/** Restrict handlers to the active collection (if one is set and non-empty). */
async function scopeToActiveCollection(
  handlers: ListenerHandler[],
  activeCollectionId: string | null | undefined
): Promise<ListenerHandler[]> {
  if (!activeCollectionId) return handlers;
  try {
    const ids = await getCollectionHandlerIds(activeCollectionId);
    if (ids.length === 0) return handlers; // empty collection → don't lock everything out
    const allowed = new Set(ids);
    return handlers.filter((h) => allowed.has(h.id));
  } catch {
    return handlers;
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
  let activeScriptId: string | null = null;
  try {
    const [hs, settings] = await Promise.all([listHandlers(), getLabSettings()]);
    handlers = hs.filter(
      (h) =>
        h.enabled &&
        h.intent_key !== "first_message" && // special: opening line, never routed
        (h.mode === "tool" || h.mode === "both")
    );
    handlers = await scopeToActiveCollection(handlers, settings?.active_collection_id);
    if (settings?.router_model) routerModel = settings.router_model;
    activeScriptId = settings?.active_script_id ?? null;
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
        if (activeScriptId) {
          // The listener answers questions automatically in script mode; a
          // parallel tool answer means the customer hears the same thing
          // twice, phrased twice.
          result =
            "The answer is being provided to you automatically — do not answer from this tool and do not say you're checking anything. Respond naturally to what they said; if nothing arrives in a moment, offer to follow up.";
        } else {
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
        }
      } else if (name === "get_offer") {
        if (activeScriptId) {
          // A script drives this call — the offer is a flow step, and letting
          // the agent pull an arbitrary offer here means two competing pitches.
          result =
            "The offer is presented automatically at the right step of this call. Do not present an offer yourself and do not say you're checking anything — respond naturally to what they said and keep the conversation moving.";
        } else {
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
        }
      } else if (name === "send_sms") {
        if (activeScriptId) {
          result =
            "NOTHING has been sent — do not claim a text was sent. The text step happens automatically later in the call, and your confirmation line will be supplied when it actually does. For now, respond naturally to what they said.";
        } else {
          const smsHandler = handlers
            .filter((h) => h.action_type === "send_sms")
            .sort((a, b) => a.priority - b.priority)[0];
          handlerId = smsHandler?.id ?? null;
          actionType = "send_sms";
          // Lab only logs the SMS — no real send.
          result = "SMS queued successfully. Tell the customer it has been sent.";
        }
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
  if (message.transcriptType !== "final") return;

  // The agent's own spoken words: logged so the router classifies replies in
  // real context ("okay, sure" right after "want me to text it?" = consent).
  if (message.role === "assistant") {
    const said = (message.transcript ?? "").trim();
    if (said) await log({ call_id: callId, event_type: "agent_said", role: "assistant", content: said });
    return;
  }

  if (message.role !== "user") return;
  const utterance = (message.transcript ?? "").trim();
  if (!utterance) return;

  const receivedAt = Date.now();
  const utteranceAt =
    typeof message.timestamp === "number" ? new Date(message.timestamp) : new Date(receivedAt);

  // Kick off every independent read at once — injection latency is customer-
  // audible dead air, so the hot path can't afford sequential roundtrips.
  const recentTurnsP = getRecentTurns(callId, 6).catch(() => []);
  const settingsP = getLabSettings();
  const handlersP = listHandlers();
  const lastInjectedP = getLastInjectedEvent(callId).catch(() => null);

  // Prior turns are read BEFORE logging this one, so the router classifies the
  // utterance in conversational context (prevents keyword-only mismatches).
  const recentTurns = await recentTurnsP;

  let utteranceEventId: number | null = null;
  try {
    utteranceEventId = await insertLabEventReturningId({
      call_id: callId,
      event_type: "utterance",
      role: "user",
      content: utterance,
      utterance_at: utteranceAt.toISOString(),
    });
  } catch (e) {
    console.error("[lab webhook] failed to log utterance:", e);
  }

  let settings;
  let handlers: ListenerHandler[] = [];
  try {
    settings = await settingsP;
    handlers = (await handlersP).filter(
      (h) =>
        h.enabled &&
        h.intent_key !== "first_message" && // special: opening line, never routed
        (h.mode === "listener" || h.mode === "both")
    );
    handlers = await scopeToActiveCollection(handlers, settings?.active_collection_id);
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

  // Classify
  let cls;
  try {
    cls = await classifyUtterance(utterance, recentTurns, handlers, settings.router_model);
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

  // Can the Playbook answer this turn on its own? The flow uses this to let
  // off-script questions fall through to the reactive layer instead of
  // dragging them down an Else branch.
  const reactiveHandler = handlers.find((h) => h.intent_key === cls.intent);
  // Conversion actions are flow steps: when a script is active the reactive
  // layer must never pitch the offer or confirm an SMS out of order — that
  // desyncs the conversation from the flow position for the rest of the call.
  // Such intents don't defer; the flow keeps walking and speaks its own step.
  const flowOwnsAction =
    !!settings.active_script_id &&
    !!reactiveHandler &&
    (reactiveHandler.action_type === "send_sms" || reactiveHandler.action_type === "give_offer");
  const reactiveCanHandle =
    cls.intent !== "none" &&
    cls.confidence >= settings.confidence_threshold &&
    !!reactiveHandler &&
    reactiveHandler.action_type !== "ignore" &&
    !flowOwnsAction;

  // Split finals: if a newer customer fragment arrived while we were busy
  // classifying, this one is stale — the newest fragment gets the response.
  if (utteranceEventId != null && (await hasNewerUtterance(callId, utteranceEventId).catch(() => false))) {
    await log({
      call_id: callId,
      event_type: "skipped",
      content: utterance,
      intent_key: cls.intent,
      meta: { reason: "superseded" },
    });
    return;
  }

  // Below-threshold guesses must never drive branching (a 0.4-confidence
  // "consent" once marched a live question straight into the goodbye) — the
  // flow sees such turns as "none" and just follows plain arrows.
  const flowIntent = cls.confidence >= settings.confidence_threshold ? cls.intent : "none";

  // ── Script runtime: if a script is active, try to advance the flow first.
  //    Reactive scenarios still handle anything the flow doesn't consume.
  if (settings.active_script_id) {
    try {
      const advanced = await runScriptFlow(
        callId,
        controlUrlHint,
        settings.active_script_id,
        flowIntent,
        utterance,
        utteranceAt,
        classifiedAt,
        reactiveCanHandle,
        utteranceEventId
      );
      if (advanced) return; // flow handled this turn
    } catch (e) {
      await log({
        call_id: callId,
        event_type: "error",
        content: "script flow failed",
        meta: { error: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  // ── Reactive-only guards (the flow above is never blocked by these) ──
  const lastInjected = await lastInjectedP;

  // Cooldown: don't whisper twice in rapid succession.
  if (lastInjected?.injected_at) {
    const elapsed = receivedAt - new Date(lastInjected.injected_at).getTime();
    if (elapsed < settings.injection_cooldown_ms) {
      await log({
        call_id: callId,
        event_type: "skipped",
        content: utterance,
        intent_key: cls.intent,
        meta: { reason: "cooldown", elapsed_ms: elapsed },
      });
      return;
    }
  }

  // Repeat suppression: re-injecting the same briefing ("repeat your last
  // point") turns the agent into a parrot — once is enough; after that the
  // agent answers from its own context.
  if (
    lastInjected?.injected_at &&
    lastInjected.intent_key === cls.intent &&
    receivedAt - new Date(lastInjected.injected_at).getTime() < 45000
  ) {
    await log({
      call_id: callId,
      event_type: "skipped",
      content: utterance,
      intent_key: cls.intent,
      meta: { reason: "repeat_suppressed" },
    });
    return;
  }

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
  if (!handler || handler.action_type === "ignore" || flowOwnsAction) {
    await log({
      call_id: callId,
      event_type: "skipped",
      content: utterance,
      intent_key: cls.intent,
      confidence: cls.confidence,
      handler_id: handler?.id ?? null,
      meta: { reason: flowOwnsAction ? "flow_owns_action" : handler ? "handler_ignore" : "handler_not_found" },
    });
    return;
  }

  // Never speak a stale reply: a newer customer fragment may have landed
  // while we were classifying/deferring — it owns the response now.
  if (utteranceEventId != null && (await hasNewerUtterance(callId, utteranceEventId).catch(() => false))) {
    await log({
      call_id: callId,
      event_type: "skipped",
      content: utterance,
      intent_key: cls.intent,
      meta: { reason: "superseded" },
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
    // verbatim → the agent speaks the line word-for-word (say);
    // reword → the line is a [STAFF] briefing the agent rephrases (add-message).
    const verbatim = handler.delivery === "verbatim";
    // Ground the briefing in the customer's actual words so the reply connects
    // to the conversation instead of reading like a recital.
    const brief = (t: string) =>
      `The customer just said: "${utterance.slice(0, 140)}" — react to that naturally in your own words, then: ${t}`;

    if (handler.action_type === "end_call") {
      // Goodbyes are always spoken verbatim, then the call ends.
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
        handler.response_template ||
        "The SMS with the details is on its way. Confirm that to the customer.";
      injectResult = verbatim
        ? await injectSay(controlUrl, injectedText, false)
        : await injectStaffNote(controlUrl, brief(injectedText), settings.trigger_response);
    } else {
      // answer / give_offer
      injectResult = verbatim
        ? await injectSay(controlUrl, injectedText, false)
        : await injectStaffNote(controlUrl, brief(injectedText), settings.trigger_response);
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
      meta: { controlStatus: injectResult.status, controlOk: injectResult.ok, delivery: handler.delivery },
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

// ── Script runtime (graph-walker) ─────────────────────────────
// Walks the active script for the call, advancing through non-speaking steps
// (no-op, if/else, loop, sub-workflow enter/return) until a box speaks/acts or
// the call ends. The walk is speculative: flow state and logs commit only when
// the flow consumes the turn. If the customer's reply is a Playbook intent the
// walked path doesn't expect — no Then branch fired on it, and the landing box
// has no scenario/candidate for it — the flow defers (returns false with no
// state change) so the reactive layer answers and the call stays parked.
type Frame = { scriptId: string; returnNodeId: string };

async function runScriptFlow(
  callId: string,
  controlUrlHint: string | null,
  activeScriptId: string,
  intent: string,
  utterance: string,
  utteranceAt: Date,
  classifiedAt: number,
  reactiveCanHandle: boolean,
  utteranceEventId: number | null
): Promise<boolean> {
  const [allHandlers, state] = await Promise.all([
    listHandlers(),
    getFlowState(callId).catch(() => null),
  ]);
  const handlerById = (id: string | null | undefined) =>
    id ? allHandlers.find((h) => h.id === id) ?? null : null;
  const intentTags = allHandlers.find((h) => h.intent_key === intent)?.tags ?? [];
  let currentScriptId = state?.script_id ?? activeScriptId;
  const stateUpdatedAt: string | null = state?.updated_at ?? null;
  const variables: Record<string, unknown> = { ...((state?.variables as Record<string, unknown>) ?? {}) };
  if (!Array.isArray(variables.__stack)) variables.__stack = [] as Frame[];
  let currentNodeId = state?.current_node_id ?? null;

  let graph = await getScriptGraph(currentScriptId);
  if (graph.nodes.length === 0) return false;

  if (!currentNodeId || !graph.nodes.find((n) => n.id === currentNodeId)) {
    const entry = findEntryNode(graph.nodes, graph.edges);
    if (!entry) return false;
    currentNodeId = entry.id;
  }

  // Side effects are queued and flushed only when the flow consumes the turn.
  type PendingLog = { content: string; targetId: string; targetLabel: string; ct: string; edgeCond: unknown; scenarioId: string | null };
  const pending: PendingLog[] = [];
  const note = (content: string, target: { id: string; label: string }, ct: string, edgeCond: unknown, scenarioId: string | null) =>
    pending.push({ content, targetId: target.id, targetLabel: target.label, ct, edgeCond, scenarioId });

  // Commit the walk. False = another concurrent turn (split final transcripts)
  // already advanced this call — drop everything; the customer must not hear
  // the same step twice.
  async function flush(): Promise<boolean> {
    // A sub-workflow result only drives branching in the same-turn continuation
    // after the Return — clear it once the turn is consumed.
    variables.__lastResult = null;
    const won = await persistFlowStateGuarded(callId, currentScriptId, currentNodeId, variables, stateUpdatedAt);
    if (!won) {
      await log({
        call_id: callId,
        event_type: "skipped",
        content: `flow turn dropped — a concurrent turn already advanced the call`,
        intent_key: intent,
        meta: { flow: true, reason: "concurrent_turn" },
      });
      return false;
    }
    for (const p of pending) {
      const ms = Date.now();
      await log({
        call_id: callId,
        event_type: "injected",
        content: p.content || `→ ${p.targetLabel || p.ct}`,
        intent_key: intent,
        handler_id: p.scenarioId,
        action_type: `flow:${p.ct}`,
        utterance_at: utteranceAt.toISOString(),
        classified_at: new Date(classifiedAt).toISOString(),
        injected_at: new Date(ms).toISOString(),
        latency_ms: ms - utteranceAt.getTime(),
        meta: { flow: true, toNode: p.targetId, nodeType: p.ct, edgeCondition: p.edgeCond },
      });
    }
    return true;
  }

  // Second staleness gate: the walk's DB roundtrips take seconds, and a newer
  // customer fragment can land in that window. Never speak a stale reply.
  async function staleNow(): Promise<boolean> {
    if (utteranceEventId == null) return false;
    const newer = await hasNewerUtterance(callId, utteranceEventId).catch(() => false);
    if (newer) {
      await log({
        call_id: callId,
        event_type: "skipped",
        content: utterance,
        intent_key: intent,
        meta: { flow: true, reason: "superseded" },
      });
    }
    return newer;
  }

  async function defer(beforeLabel: string): Promise<boolean> {
    await log({
      call_id: callId,
      event_type: "skipped",
      content: `flow parked — Playbook answers "${intent}"`,
      intent_key: intent,
      meta: { flow: true, reason: "deferred_to_playbook", before: beforeLabel },
    });
    return false;
  }

  const bumpLoop = (nodeId: string) => {
    const key = "__loop_" + nodeId;
    const n = ((variables[key] as number) ?? 0) + 1;
    variables[key] = n;
    return n;
  };

  // Did a branch fire *because of* this utterance? (Then edge whose intent/tag
  // condition matched, or a legacy intent/tag condition edge.)
  function edgeRecognizedIntent(node: NonNullable<ReturnType<typeof nodeById>>, edge: NonNullable<ReturnType<typeof pickNextEdge>>): boolean {
    const c = (edge.condition ?? {}) as Record<string, unknown>;
    if (contentTypeOf(node) === "ifelse") {
      if ((c.handle as string) !== "then") return false;
      const cfg = (node.config ?? {}) as Record<string, unknown>;
      const by = (cfg.condBy as string) ?? "intent";
      if (by === "intent") return cfg.condValue === intent;
      if (by === "tag") return !!cfg.condValue && intentTags.includes(cfg.condValue as string);
      return false; // result-driven — unrelated to this utterance
    }
    const by = (c.by as string) ?? (c.kind as string);
    if (by === "intent") return c.value === intent;
    if (by === "tag") return !!c.value && intentTags.includes(c.value as string);
    return false;
  }

  // Fetch the control URL lazily — a deferred walk never needs it.
  let controlUrlCache: string | null | undefined;
  async function ctl(): Promise<string | null> {
    if (controlUrlCache === undefined) controlUrlCache = await getControlUrl(callId, controlUrlHint);
    return controlUrlCache;
  }

  let pathExpected = false;
  // Set when entering a sub-workflow whose entry box is a real step: that box
  // must run this iteration (it wasn't reached over an edge).
  let jumpTo: ReturnType<typeof nodeById> = null;
  let guard = 0;
  while (guard++ < 16) {
    const result = (variables.__lastResult as string) ?? null;
    let target: ReturnType<typeof nodeById>;
    let edgeCond: unknown;
    if (jumpTo) {
      target = jumpTo;
      jumpTo = null;
      edgeCond = { entered: "subworkflow" };
    } else {
      const currentNode = nodeById(graph.nodes, currentNodeId!);
      if (!currentNode) return false;
      const edge = pickNextEdge(currentNode, graph.edges, { intent, tags: intentTags, result, bumpLoop });
      if (!edge) return false; // nowhere to go → reactive layer handles it
      if (edgeRecognizedIntent(currentNode, edge)) pathExpected = true;
      target = nodeById(graph.nodes, edge.target_node_id);
      edgeCond = edge.condition;
    }
    if (!target) return false;

    const ct = contentTypeOf(target);
    const cfg = target.config as Record<string, unknown>;

    // ── Control / pass-through boxes: advance on the same turn ──
    if (ct === "noop" || ct === "ifelse" || ct === "loop") {
      currentNodeId = target.id;
      note("", target, ct, edgeCond, null);
      continue;
    }

    // ── Wait box: pause here and wait for the next customer utterance ──
    if (ct === "wait") {
      if (reactiveCanHandle && !pathExpected) return defer(target.label || ct);
      if (await staleNow()) return true;
      currentNodeId = target.id;
      note("", target, ct, edgeCond, null);
      await flush();
      return true;
    }

    if (ct === "subworkflow") {
      const subId = cfg.subworkflowId as string | undefined;
      if (subId) {
        (variables.__stack as Frame[]).push({ scriptId: currentScriptId, returnNodeId: target.id });
        graph = await getScriptGraph(subId);
        currentScriptId = subId;
        note(`↳ enter sub-workflow`, target, ct, edgeCond, null);
        const entry = findEntryNode(graph.nodes, graph.edges);
        if (!entry) return false;
        currentNodeId = entry.id;
        // A Start box is a pure position (the walk advances from it); any
        // other entry box is the phase's first step and must actually run.
        if (entry.type !== "start") jumpTo = entry;
        continue;
      }
      currentNodeId = target.id;
      continue;
    }

    // Return → hand control + a result back to the parent workflow.
    // (Legacy: an `end` box inside a sub-workflow also returns, for back-compat.)
    if (ct === "return" || (ct === "end" && (variables.__stack as Frame[]).length > 0)) {
      const stack = variables.__stack as Frame[];
      if (stack.length > 0) {
        const frame = stack.pop()!;
        variables.__lastResult = (cfg.resultName as string) || target.label || "done";
        currentScriptId = frame.scriptId;
        graph = await getScriptGraph(currentScriptId);
        currentNodeId = frame.returnNodeId;
        note(`↩ return: ${variables.__lastResult}`, target, "return", edgeCond, null);
        continue;
      }
      // Return at top level (no parent) → just end the call gracefully.
    }

    if (ct === "end" || ct === "return") {
      // End Call (or a top-level Return) → goodbye + hang up.
      const scn = handlerById(target.scenario_id);
      if (reactiveCanHandle && !pathExpected && scn?.intent_key !== intent) return defer(target.label || ct);
      if (await staleNow()) return true;
      const text = scn?.response_template || "Thanks for your time today. Goodbye!";
      currentNodeId = target.id;
      note(text, target, ct, edgeCond, scn?.id ?? null);
      if (!(await flush())) return true; // lost the race — say nothing
      const controlUrl = await ctl();
      if (controlUrl) {
        const r = await injectSay(controlUrl, text, true);
        if (!r.ok) setTimeout(() => endCall(controlUrl).catch(() => {}), 4000);
      }
      return true;
    }

    // ── Speaking / action steps: consume the turn (or defer if the reply
    //    belongs to the Playbook and this box has no line for it) ──
    let scenario: ListenerHandler | null = null;

    if (ct === "scenario") {
      const cands = [target.scenario_id, ...((cfg.candidateScenarioIds as string[]) ?? [])].filter(Boolean) as string[];
      const match = allHandlers.find((h) => cands.includes(h.id) && h.intent_key === intent) ?? null;
      if (reactiveCanHandle && !pathExpected && !match) return defer(target.label || ct);
      scenario = match ?? handlerById(target.scenario_id) ?? handlerById(cands[0]);
    } else if (ct === "collection") {
      const ids = cfg.collectionId ? await getCollectionHandlerIds(cfg.collectionId as string).catch(() => []) : [];
      const match = allHandlers.find((h) => ids.includes(h.id) && h.intent_key === intent) ?? null;
      if (reactiveCanHandle && !pathExpected && !match) return defer(target.label || ct);
      // No member fits the reply → the box's default line; failing that, the
      // highest-priority member (never an arbitrary row).
      scenario =
        match ??
        handlerById(target.scenario_id) ??
        allHandlers.filter((h) => ids.includes(h.id)).sort((a, b) => a.priority - b.priority)[0] ??
        null;
    } else {
      // send_sms / transfer
      scenario = handlerById(target.scenario_id);
      if (reactiveCanHandle && !pathExpected && scenario?.intent_key !== intent) return defer(target.label || ct);
    }

    if (await staleNow()) return true;
    currentNodeId = target.id;
    // Ground briefings in the customer's actual words — the step should feel
    // like a reply to them, not a recital of the next script line.
    const brief = (t: string) =>
      `The customer just said: "${utterance.slice(0, 140)}" — react to that naturally in your own words, then: ${t}`;
    let injectedText = "";
    if (ct === "send_sms") {
      injectedText = scenario?.response_template || "The SMS with the details is on its way. Confirm that to the customer.";
    } else if (ct === "transfer") {
      injectedText = scenario?.response_template || "Thanks — let me connect you to one of our team now.";
    } else if (scenario) {
      injectedText = scenario.response_template ?? "";
    }

    note(injectedText, target, ct, edgeCond, scenario?.id ?? null);
    if (!(await flush())) return true; // lost the race — say nothing
    const controlUrl = await ctl();
    if (controlUrl) {
      if (ct === "send_sms") {
        await injectStaffNote(controlUrl, brief(injectedText), true);
      } else if (ct === "transfer") {
        await injectSay(controlUrl, injectedText, false);
      } else if (scenario) {
        scenario.delivery === "verbatim"
          ? await injectSay(controlUrl, injectedText, false)
          : await injectStaffNote(controlUrl, brief(injectedText), true);
      }
    }
    return true;
  }
  return false;
}
