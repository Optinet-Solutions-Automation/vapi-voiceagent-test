// VAPI server webhook for the Listener Lab assistant.
// Receives mid-call events (tool-calls, live transcript chunks, status updates)
// and runs the organizer: classify utterances, resolve handlers, inject answers.
import { NextResponse, after } from "next/server";
import {
  listHandlers,
  getLabSettings,
  insertLabEvent,
  insertLabEventReturningId,
  getSpeculated,
  hasNewerUtterance,
  agentSpokeSince,
  agentWordsSince,
  assistantSpeaking,
  recentUnansweredFragment,
  getDeliveredHandlers,
  getLastInjectedEvent,
  getRecentTurns,
  getCollectionHandlerIds,
  getScriptGraph,
  getFlowState,
  persistFlowStateGuarded,
} from "@/lib/lab-db";
import { findEntryNode, nodeById, pickNextEdge, contentTypeOf } from "@/lib/lab-flow";
import { classifyUtterance, type Classification } from "@/lib/lab-router";
import {
  getControlUrl,
  injectStaffNote,
  injectSay,
  endCall,
} from "@/lib/lab-control";
import type { ListenerHandler } from "@/lib/database.types";

export const dynamic = "force-dynamic";
// A turn can legitimately hold the line for a while (speaking lock up to 6s +
// classification + injection) — don't let the platform kill it mid-injection.
export const maxDuration = 60;

// Playbook rows that are prompt material, not conversation moves: the opening
// line and the campaign identity. Never routed, never injected mid-call.
const SPECIAL_INTENTS = new Set(["first_message", "identity"]);

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

// Speaking lock: never fire an injection while the agent is mid-sentence —
// that's what produced the overlapping double-intro. Poll briefly until it
// stops (or a short cap, so a long monologue can't block the line forever).
async function waitForAgentSilence(callId: string, maxMs = 6000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const speaking = await assistantSpeaking(callId).catch(() => false);
    if (!speaking) return;
    await new Promise((r) => setTimeout(r, 400));
  }
}

// ── Self-coverage: did the agent's own reply already deliver this line? ──
// The agent can answer identity-class questions from its standing prompt; when
// it has, injecting the supplied line on top makes it say the same thing twice
// ("It's Victor… It's Victor from Lucky Seven."). Compare content words:
// instruction-style reword templates share almost none with real speech, so
// they pass through — only genuinely already-spoken content is dropped.
const STOP_WORDS = new Set([
  "the", "and", "for", "you", "your", "from", "with", "that", "this", "just",
  "about", "them", "they", "their", "its", "are", "was", "were", "have", "has",
  "had", "will", "would", "can", "could", "our", "out", "not", "but", "all",
  "any", "then", "than", "when", "what", "who", "how", "why", "say", "said",
]);
function contentWords(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  );
}
function selfCovered(line: string, spoken: string | null): boolean {
  if (!spoken) return false;
  const need = contentWords(line);
  if (need.size < 2) return false;
  const have = contentWords(spoken);
  let hit = 0;
  for (const w of need) if (have.has(w)) hit++;
  return hit / need.size >= 0.7;
}

// ── Observer navigation: what replies does the CURRENT script step expect? ──
// The observer knows the script and the call's position, so the expected set
// at any moment = the current box's outgoing reply connectors + the members
// of its collection. Fed to the router as priors: speculation pre-validates
// against what the step is waiting for instead of guessing blind.
async function expectedIntentKeys(
  callId: string,
  handlers: ListenerHandler[],
  activeScriptId: string | null
): Promise<string[]> {
  if (!activeScriptId) return [];
  const state = await getFlowState(callId).catch(() => null);
  const scriptId = state?.script_id ?? activeScriptId;
  const graph = await getScriptGraph(scriptId).catch(() => ({ nodes: [], edges: [] }));
  if (graph.nodes.length === 0) return [];
  let nodeId: string | null = state?.current_node_id ?? null;
  if (!nodeId || !graph.nodes.find((n) => n.id === nodeId)) nodeId = findEntryNode(graph.nodes, graph.edges)?.id ?? null;
  if (!nodeId) return [];
  const keys: string[] = [];
  const collectionIds = new Set<string>();
  for (const e of graph.edges.filter((x) => x.source_node_id === nodeId)) {
    const c = (e.condition ?? {}) as Record<string, unknown>;
    if (((c.by as string) ?? (c.kind as string)) === "intent" && c.value) keys.push(c.value as string);
    // Members of collections this box's arrows lead INTO are live choices too:
    // a "yes" that routes into a reaction stage is ALSO 'player takes the
    // bait' — the router should return both so the stage speaks its member.
    const tgt = graph.nodes.find((n) => n.id === e.target_node_id);
    const tcfg = (tgt?.config ?? {}) as Record<string, unknown>;
    if (tgt && contentTypeOf(tgt) === "collection" && tcfg.collectionId) collectionIds.add(tcfg.collectionId as string);
  }
  const node = graph.nodes.find((n) => n.id === nodeId);
  const cfg = (node?.config ?? {}) as Record<string, unknown>;
  if (node && contentTypeOf(node) === "collection" && cfg.collectionId) collectionIds.add(cfg.collectionId as string);
  for (const cid of collectionIds) {
    const ids = await getCollectionHandlerIds(cid).catch(() => [] as string[]);
    for (const h of handlers) if (ids.includes(h.id)) keys.push(h.intent_key);
  }
  return [...new Set(keys)];
}

// ── Anticipatory classification ───────────────────────────────
// Start the router on the customer's LAST partial transcript while they're
// still speaking. The final transcript very often equals the last partial, so
// by the time they stop, the classification is already in flight — the
// listener anticipates instead of waiting for the turn to end.
type SpecEntry = { text: string; promise: Promise<Classification>; at: number };
const speculativeCls = new Map<string, SpecEntry>();

function speculate(callId: string, text: string): Promise<void> | undefined {
  const now = Date.now();
  for (const [k, v] of speculativeCls) if (now - v.at > 30000) speculativeCls.delete(k);
  if (text.split(/\s+/).length < 4) return; // too short to be worth a router call
  const cur = speculativeCls.get(callId);
  if (cur && (cur.text === text || now - cur.at < 1000)) return; // throttle
  const work = (async () => {
    const [settings, hs, turns] = await Promise.all([
      getLabSettings(),
      listHandlers(),
      getRecentTurns(callId, 6).catch(() => []),
    ]);
    const eligible = hs.filter(
      (h) => h.enabled && !SPECIAL_INTENTS.has(h.intent_key) && (h.mode === "listener" || h.mode === "both")
    );
    let scoped = await scopeToActiveCollection(eligible, settings?.active_collection_id);
    scoped = await withScriptVocabulary(scoped, eligible, settings?.active_script_id);
    const expected = await expectedIntentKeys(callId, scoped, settings?.active_script_id ?? null).catch(() => [] as string[]);
    const cls = await classifyUtterance(text, turns, scoped, settings?.router_model ?? "gpt-5.4-mini", expected);
    return { cls, expected };
  })();
  const promise = work.then((w) => w.cls);
  promise.catch(() => {}); // never an unhandled rejection
  speculativeCls.set(callId, { text, promise, at: now });
  // The map dies at the serverless instance boundary — the partial and the
  // final rarely land on the same instance, so also persist the result; the
  // final's handler reads it back when the map misses.
  return work
    .then(async ({ cls, expected }) => {
      await log({
        call_id: callId,
        event_type: "speculated",
        content: text,
        meta: { cls: cls as unknown as Record<string, unknown>, expected: expected.slice(0, 6) },
      });
    })
    .catch(() => {});
}

/** The active script's OWN vocabulary is always routable — connector
 *  conditions, legacy branch values, box scenarios/candidates, and the
 *  members of collections its boxes reference. A drawn condition IS the
 *  author saying "listen for this here"; it must never depend on campaign
 *  collection membership (conditions are plumbing, not Playbook content). */
async function withScriptVocabulary(
  scoped: ListenerHandler[],
  base: ListenerHandler[],
  activeScriptId: string | null | undefined
): Promise<ListenerHandler[]> {
  if (!activeScriptId || scoped.length === base.length) return scoped;
  try {
    const graph = await getScriptGraph(activeScriptId);
    const keys = new Set<string>();
    const wantIds = new Set<string>();
    for (const e of graph.edges) {
      const c = (e.condition ?? {}) as Record<string, unknown>;
      if (((c.by as string) ?? (c.kind as string)) === "intent" && c.value) keys.add(c.value as string);
    }
    const colIds = new Set<string>();
    for (const n of graph.nodes) {
      const cfg = (n.config ?? {}) as Record<string, unknown>;
      if (cfg.collectionId) colIds.add(cfg.collectionId as string);
      if (n.scenario_id) wantIds.add(n.scenario_id);
      for (const cid of (cfg.candidateScenarioIds as string[]) ?? []) wantIds.add(cid);
      if (((cfg.condBy as string) ?? "intent") === "intent" && cfg.condValue) keys.add(cfg.condValue as string);
      for (const conn of (cfg.connectors as { intentKey?: string }[]) ?? []) if (conn?.intentKey) keys.add(conn.intentKey);
    }
    for (const cid of colIds)
      for (const id of await getCollectionHandlerIds(cid).catch(() => [] as string[])) wantIds.add(id);
    const have = new Set(scoped.map((h) => h.id));
    const extra = base.filter((h) => !have.has(h.id) && (keys.has(h.intent_key) || wantIds.has(h.id)));
    return extra.length ? [...scoped, ...extra] : scoped;
  } catch {
    return scoped;
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
      // Anticipate while the customer is still speaking: partials warm up the
      // router so the final's classification is usually already in flight.
      if (message.role === "user" && message.transcriptType === "partial") {
        const partial = (message.transcript ?? "").trim();
        if (partial) {
          const p = speculate(callId, partial);
          // Serverless freezes background work once the response returns —
          // keep the invocation alive until the classification is stored.
          if (p) after(() => p);
        }
        return NextResponse.json({});
      }
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
        !SPECIAL_INTENTS.has(h.intent_key) && // special (opening/identity): never routed
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
            "INSTRUCTION TO YOU — never repeat any of this to the customer: the answer is being provided to you automatically. Do not answer from this tool and do not say you're checking anything. Respond naturally to what they said; if nothing arrives in a moment, offer to follow up.";
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
            "INSTRUCTION TO YOU — never repeat any of this to the customer: the offer is presented for you at the right step of this call. Do not present an offer yourself, do not describe how offers appear, and do not say you're checking anything — respond naturally to what they said and keep the conversation moving.";
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
            "INSTRUCTION TO YOU — never repeat any of this to the customer: NOTHING has been sent, do not claim a text was sent. The text step happens automatically later in the call, and your confirmation line will be supplied when it actually does. For now, respond naturally to what they said.";
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
        if (activeScriptId) {
          // The flow's End box (or a reactive end_call scenario) owns the
          // wrap-up — a tool goodbye on top means two goodbyes back to back.
          result =
            "INSTRUCTION TO YOU — never repeat any of this to the customer: do not say goodbye; your closing line is delivered automatically and the call ends on its own. The call is WRAPPING UP — never say 'hold on', 'one sec' or any wait-phrase now; a warm 'alright—' is the most you may say, or stay silent.";
        } else {
          result = "Say a brief, warm goodbye now.";
          // End the call shortly after the goodbye; fire-and-forget.
          const controlUrl = await getControlUrl(callId, controlUrlHint);
          if (controlUrl) {
            setTimeout(() => {
              endCall(controlUrl).catch(() => {});
            }, 4000);
          }
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

  // Split finals are ONE customer turn: fold the recent unanswered fragment
  // into the newest one so the router sees the whole turn ("who is this
  // again? what is this about?") and multi-part merging can work.
  let turnText = utterance;
  if (utteranceEventId != null) {
    const prevFrag = await recentUnansweredFragment(callId, utteranceEventId, 4000).catch(() => null);
    if (prevFrag) turnText = `${prevFrag} ${utterance}`;
  }

  let settings;
  let handlers: ListenerHandler[] = [];
  try {
    settings = await settingsP;
    const eligible = (await handlersP).filter(
      (h) =>
        h.enabled &&
        !SPECIAL_INTENTS.has(h.intent_key) && // special (opening/identity): never routed
        (h.mode === "listener" || h.mode === "both")
    );
    handlers = await scopeToActiveCollection(eligible, settings?.active_collection_id);
    handlers = await withScriptVocabulary(handlers, eligible, settings?.active_script_id);
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

  // Observer navigation priors for the fresh-classify fallback — started now
  // so the flow-position lookup runs while the speculative checks happen.
  const expectedPromise = expectedIntentKeys(callId, handlers, settings.active_script_id ?? null).catch(
    () => [] as string[]
  );

  // Classify — reusing the speculative run from the partial transcripts when
  // the final matches it (the router's answer is then already in flight).
  let cls;
  let speculativeHit = false;
  const spec = speculativeCls.get(callId);
  // The speculative run only covers this fragment — reuse it only when no
  // earlier fragment was folded in.
  if (spec && spec.text === utterance && turnText === utterance) {
    try {
      cls = await spec.promise;
      speculativeHit = true;
    } catch {
      /* fall through to a fresh classification */
    }
    speculativeCls.delete(callId);
  }
  // Same-instance miss (on serverless the partial and the final rarely share
  // an instance) — check the persisted speculation before paying for a fresh
  // router call.
  if (!cls && turnText === utterance) {
    const stored = await getSpeculated(callId, utterance, 15000).catch(() => null);
    if (stored) {
      cls = stored as unknown as Classification;
      speculativeHit = true;
    }
  }
  if (!cls) {
    try {
      cls = await classifyUtterance(turnText, recentTurns, handlers, settings.router_model, await expectedPromise);
    } catch (e) {
      await log({
        call_id: callId,
        event_type: "error",
        content: "router failed",
        meta: { error: e instanceof Error ? e.message : String(e) },
      });
      return;
    }
  }
  const classifiedAt = Date.now();

  // Every intent the reply addressed (multi-part replies), threshold-filtered,
  // primary first. Below-threshold guesses never drive anything, and neither
  // do hallucinated keys — the router once invented "promo_redirect", which
  // passed the threshold and could suppress a legitimate defer.
  const knownKeys = new Set(handlers.map((h) => h.intent_key));
  const intents = Array.from(
    new Set(
      (cls.intents ?? [{ intent: cls.intent, confidence: cls.confidence }])
        .filter((g) => g.intent !== "none" && g.confidence >= settings.confidence_threshold && knownKeys.has(g.intent))
        .map((g) => g.intent)
    )
  );
  const flowIntent = intents[0] ?? "none";

  await log({
    call_id: callId,
    event_type: "classified",
    content: turnText,
    intent_key: cls.intent,
    confidence: cls.confidence,
    utterance_at: utteranceAt.toISOString(),
    classified_at: new Date(classifiedAt).toISOString(),
    meta: {
      raw: cls.raw,
      intents,
      speculative: speculativeHit,
      merged: turnText !== utterance,
      // Observer context: what the script step was expecting when this came in.
      expected: (await expectedPromise).slice(0, 6),
    },
  });

  // Can the Playbook answer this turn on its own? The flow uses this to let
  // off-script questions fall through to the reactive layer instead of
  // dragging them down an Else branch.
  const reactiveHandler = handlers.find((h) => h.intent_key === flowIntent);
  // Conversion actions are flow steps: when a script is active the reactive
  // layer must never pitch the offer or confirm an SMS out of order — that
  // desyncs the conversation from the flow position for the rest of the call.
  // Such intents don't defer; the flow keeps walking and speaks its own step.
  const flowOwnsAction =
    !!settings.active_script_id &&
    !!reactiveHandler &&
    (reactiveHandler.action_type === "send_sms" || reactiveHandler.action_type === "give_offer");
  const reactiveCanHandle =
    flowIntent !== "none" && !!reactiveHandler && reactiveHandler.action_type !== "ignore" && !flowOwnsAction;

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

  // ── Script runtime: if a script is active, try to advance the flow first.
  //    Reactive scenarios still handle anything the flow doesn't consume.
  if (settings.active_script_id) {
    try {
      const advanced = await runScriptFlow(
        callId,
        controlUrlHint,
        settings.active_script_id,
        flowIntent,
        intents,
        turnText,
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
    lastInjected.intent_key === flowIntent &&
    receivedAt - new Date(lastInjected.injected_at).getTime() < 45000
  ) {
    await log({
      call_id: callId,
      event_type: "skipped",
      content: utterance,
      intent_key: flowIntent,
      meta: { reason: "repeat_suppressed" },
    });
    return;
  }

  // Decision gate — the conflict protocol
  if (flowIntent === "none") {
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

  const handler = handlers.find((h) => h.intent_key === flowIntent);
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

  // Speaking lock: never inject over a mid-sentence agent — wait for it to
  // finish, then deliver as a continuation. A fragment may land while
  // waiting, so staleness is re-checked after.
  await waitForAgentSilence(callId);
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

  try {
    let injectResult;
    let injectedText = handler.response_template;
    // verbatim → the agent speaks the line word-for-word (say);
    // reword → the line is a [STAFF] briefing the agent rephrases (add-message).
    const verbatim = handler.delivery === "verbatim";
    // One response per customer turn: if the agent already answered naturally
    // while this line was in flight, it must CONTINUE that reply — never
    // re-acknowledge, never restart, never ask again. Quote its own words
    // back: showing what it said beats telling it not to repeat itself.
    const [alreadyReplied, deliveredRows] = await Promise.all([
      utteranceEventId != null ? agentSpokeSince(callId, utteranceEventId).catch(() => false) : Promise.resolve(false),
      // The call's ledger: what has already been said, and how often.
      getDeliveredHandlers(callId).catch(() => [] as { handler_id: string; count: number }[]),
    ]);
    const spokenSince =
      alreadyReplied && utteranceEventId != null
        ? await agentWordsSince(callId, utteranceEventId).catch(() => null)
        : null;
    // Anti-repeat ledger: delivering the same line twice is the #1 quality
    // sin. A repeated answer is downgraded to a briefing with an explicit
    // "shorter, different words" instruction; the covered list keeps the
    // agent from re-opening finished topics on its own.
    const priorRepeats = deliveredRows.find((r) => r.handler_id === handler.id)?.count ?? 0;
    const coveredNames = deliveredRows
      .filter((r) => r.handler_id !== handler.id)
      .map((r) => handlers.find((h) => h.id === r.handler_id)?.name)
      .filter((n): n is string => !!n)
      .slice(0, 4);
    const coveredLine = coveredNames.length
      ? ` (Earlier in this call you already covered: ${coveredNames.join("; ")} — don't re-open those unless asked.)`
      : "";
    const repeatLine =
      priorRepeats > 0
        ? ` (You've already answered this ${priorRepeats === 1 ? "once" : `${priorRepeats} times`} this call — likely a clarification. Do NOT restate the same sentence: shift the emphasis or add ONE new concrete detail. E.g. a second self-introduction stresses the COMPANY you represent, not your name again.)`
        : "";
    // Ground the briefing in the customer's actual words so the reply connects
    // to the conversation instead of reading like a recital. In script mode,
    // clamp the tail — the model otherwise appends invented follow-ups.
    const scriptClamp = settings.active_script_id
      ? " Deliver ONLY that, then stop — no added follow-up question of your own; the script decides what comes next."
      : "";
    const reactPhrase = settings.active_script_id
      ? "open with at most ONE filler from your approved list (or none), then deliver:"
      : "react to that naturally in your own words, then:";
    const brief = (t: string) =>
      (alreadyReplied
        ? `You already started replying${spokenSince ? ` — your words so far: "${spokenSince}"` : ""}. Continue seamlessly from where you left off with ONLY the following — do not repeat or rephrase anything you already said, do not introduce yourself again, do not re-acknowledge (keep facts, prices and terms word-accurate): ${t}`
        : `The customer just said: "${turnText.slice(0, 160)}" — ${reactPhrase} ${t}`) +
      scriptClamp +
      repeatLine +
      coveredLine;
    // Multi-part replies ("how much is it — and where did you get my number?"):
    // fold every additional matched answer into the SAME briefing so the agent
    // gives ONE short reply instead of answering piece by piece.
    const extraHandlers = intents
      .slice(1)
      .map((k) => handlers.find((h) => h.intent_key === k))
      .filter((h): h is ListenerHandler => !!h && h.action_type === "answer" && h.id !== handler.id);
    const mergeTexts = (texts: string[]) =>
      `The customer raised ${texts.length} points at once — cover ALL of them in ONE short, natural reply (a single paragraph, keep exact facts, prices and terms word-accurate): ` +
      texts.map((t, i) => `(${i + 1}) ${t}`).join(" ");

    // The agent's own reply already delivered this line's content — a second
    // delivery is the double-intro. Stand down; the turn is answered.
    if (
      (handler.action_type === "answer" || handler.action_type === "give_offer") &&
      extraHandlers.length === 0 &&
      alreadyReplied &&
      selfCovered(injectedText, spokenSince)
    ) {
      await log({
        call_id: callId,
        event_type: "skipped",
        content: utterance,
        intent_key: cls.intent,
        handler_id: handler.id,
        meta: { reason: "self_covered", spoken: (spokenSince ?? "").slice(0, 160) },
      });
      return;
    }

    if (handler.action_type === "end_call") {
      if (!handler.response_template) {
        // Empty template = machine/voicemail detected: hang up WITHOUT
        // speaking — pitching into a recording costs money and never sells.
        injectResult = await endCall(controlUrl);
        injectedText = "(machine detected — hung up without speaking)";
      } else {
        // Goodbyes are spoken verbatim, then the call ends.
        injectedText = handler.response_template;
        injectResult = await injectSay(controlUrl, injectedText, true);
        if (!injectResult.ok) {
          // Fallback: plain say then explicit end-call
          injectResult = await injectSay(controlUrl, injectedText, false);
          setTimeout(() => {
            endCall(controlUrl).catch(() => {});
          }, 4000);
        }
      }
    } else if (handler.action_type === "send_sms") {
      injectedText =
        handler.response_template ||
        "The SMS with the details is on its way. Confirm that to the customer.";
      injectResult = verbatim
        ? await injectSay(controlUrl, injectedText, false)
        : await injectStaffNote(controlUrl, brief(injectedText), settings.trigger_response);
    } else if (extraHandlers.length > 0) {
      // answer / give_offer with additional matched answers → one merged reply
      injectedText = mergeTexts([handler.response_template, ...extraHandlers.map((h) => h.response_template)]);
      injectResult = await injectStaffNote(controlUrl, brief(injectedText), settings.trigger_response);
    } else {
      // answer / give_offer — a verbatim say after the agent's own reply
      // would restate/re-ask on top of it, and a repeated line must never be
      // spoken word-for-word again: both become continuation notes.
      injectResult =
        verbatim && !alreadyReplied && priorRepeats === 0
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
      meta: {
        controlStatus: injectResult.status,
        controlOk: injectResult.ok,
        delivery: handler.delivery,
        mode: alreadyReplied ? "continue_after_reply" : "fresh",
        repeated: priorRepeats,
        covered: coveredNames.length,
      },
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
  intents: string[],
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
  type PendingLog = { content: string; targetId: string; targetLabel: string; ct: string; edgeCond: unknown; scenarioId: string | null; mode?: string; extra?: Record<string, unknown> };
  const pending: PendingLog[] = [];
  const note = (content: string, target: { id: string; label: string }, ct: string, edgeCond: unknown, scenarioId: string | null, mode?: string, extra?: Record<string, unknown>) =>
    pending.push({ content, targetId: target.id, targetLabel: target.label, ct, edgeCond, scenarioId, mode, extra });

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
        meta: { flow: true, toNode: p.targetId, nodeType: p.ct, edgeCondition: p.edgeCond, ...(p.mode ? { mode: p.mode } : {}), ...(p.extra ?? {}) },
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
  // condition matched, or a connector/legacy intent condition edge.) Intents
  // consumed by the routing are remembered so the routed box's line isn't
  // ALSO merged with those intents' own Playbook answers.
  const consumedIntents = new Set<string>();
  function edgeRecognizedIntent(node: NonNullable<ReturnType<typeof nodeById>>, edge: NonNullable<ReturnType<typeof pickNextEdge>>): boolean {
    const c = (edge.condition ?? {}) as Record<string, unknown>;
    if (contentTypeOf(node) === "ifelse") {
      if ((c.handle as string) !== "then") return false;
      const cfg = (node.config ?? {}) as Record<string, unknown>;
      const by = (cfg.condBy as string) ?? "intent";
      if (by === "intent") {
        const ok = intents.includes(cfg.condValue as string);
        if (ok) consumedIntents.add(cfg.condValue as string);
        return ok;
      }
      if (by === "tag") return !!cfg.condValue && intentTags.includes(cfg.condValue as string);
      return false; // result-driven — unrelated to this utterance
    }
    const by = (c.by as string) ?? (c.kind as string);
    if (by === "intent") {
      const ok = intents.includes(c.value as string);
      if (ok) consumedIntents.add(c.value as string);
      return ok;
    }
    if (by === "tag") return !!c.value && intentTags.includes(c.value as string);
    // An "any other reply" catch-all is an explicit author instruction: this
    // arrow fires NO MATTER WHAT was said — it owns the turn, no deferring.
    if (by === "any") return true;
    return false;
  }

  // Does an if/else within the next few hops branch on one of this turn's
  // intents? Used to skip a speaking box the reply has already answered past —
  // consent arriving while the flow still sits before the pitch (or before a
  // chain of checks) must take its branch, not trigger the box's default.
  // Chains of consecutive if/elses are walked via their Else edges.
  function nextIfElseRecognizes(fromId: string): boolean {
    let cursor = fromId;
    for (let hops = 0; hops < 3; hops++) {
      const outs = graph.edges.filter((e) => e.source_node_id === cursor);
      const step =
        hops === 0
          ? outs.length === 1
            ? outs[0]
            : undefined
          : outs.find((e) => (((e.condition ?? {}) as Record<string, unknown>).handle as string) === "else");
      if (!step) return false;
      const nxt = nodeById(graph.nodes, step.target_node_id);
      if (!nxt || contentTypeOf(nxt) !== "ifelse") return false;
      const c = (nxt.config ?? {}) as Record<string, unknown>;
      if (((c.condBy as string) ?? "intent") === "intent" && intents.includes(c.condValue as string)) return true;
      cursor = nxt.id;
    }
    return false;
  }

  // Connector model: does one of this box's OWN reply connectors match the
  // turn? The reply answered PAST the box (e.g. consent while the flow still
  // sits before the pitch) — pass through silently; the connector routes it.
  function connectorRecognizes(nodeId: string): boolean {
    return graph.edges.some((e) => {
      if (e.source_node_id !== nodeId) return false;
      const c = (e.condition ?? {}) as Record<string, unknown>;
      const by = (c.by as string) ?? (c.kind as string);
      return by === "intent" && !!c.value && intents.includes(c.value as string);
    });
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
      const edge = pickNextEdge(currentNode, graph.edges, { intent, intents, tags: intentTags, result, bumpLoop });
      if (!edge) return false; // nowhere to go → reactive layer handles it
      if (edgeRecognizedIntent(currentNode, edge)) pathExpected = true;
      target = nodeById(graph.nodes, edge.target_node_id);
      edgeCond = edge.condition;
    }
    if (!target) return false;

    const ct = contentTypeOf(target);
    const cfg = target.config as Record<string, unknown>;

    // A deactivated box never speaks or acts — the walk passes through it and
    // its outgoing connectors route the same turn.
    if (cfg.disabled === true) {
      currentNodeId = target.id;
      note("", target, ct, edgeCond, null, "disabled_skipped");
      continue;
    }

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
      if (reactiveCanHandle && !pathExpected && !(scn && intents.includes(scn.intent_key))) return defer(target.label || ct);
      if (await staleNow()) return true;
      await waitForAgentSilence(callId); // speaking lock
      if (await staleNow()) return true;
      const goodbyeStatements = (((cfg.statements as string[]) ?? []).map((s) => (s ?? "").trim()).filter(Boolean));
      const text = [scn?.response_template || "Thanks for your time today. Goodbye!", ...goodbyeStatements].join(" ");
      // Goodbye delivery honours the scenario: exact line → spoken verbatim
      // with the hangup attached; reword → briefed, hangup follows shortly.
      const rewordGoodbye = scn?.delivery === "reword" && !!scn?.response_template;
      currentNodeId = target.id;
      note(text, target, ct, edgeCond, scn?.id ?? null, undefined, rewordGoodbye ? { rewordGoodbye: true } : undefined);
      if (!(await flush())) return true; // lost the race — say nothing
      const controlUrl = await ctl();
      if (controlUrl) {
        if (rewordGoodbye) {
          await injectStaffNote(controlUrl, `Deliver this goodbye in your own words — nothing else, no questions — then stop speaking: ${text}`, true).catch(() => {});
          setTimeout(() => endCall(controlUrl).catch(() => {}), 7000);
        } else {
          const r = await injectSay(controlUrl, text, true);
          if (!r.ok) setTimeout(() => endCall(controlUrl).catch(() => {}), 4000);
        }
      }
      return true;
    }

    // ── Speaking / action steps: consume the turn (or defer if the reply
    //    belongs to the Playbook and this box has no line for it) ──
    let scenario: ListenerHandler | null = null;
    // Multi-part replies at a collection: every matched member's content is
    // folded into ONE briefing so the agent gives a single short reply.
    let mergedText: string | null = null;
    let mergedIds: string[] = [];
    // What the entered collection handles — used to ground the agent when the
    // box has nothing specific to say (no default line, no matching member).
    let stageMemberNames: string[] = [];

    if (ct === "scenario") {
      const cands = [target.scenario_id, ...((cfg.candidateScenarioIds as string[]) ?? [])].filter(Boolean) as string[];
      const match = allHandlers.find((h) => cands.includes(h.id) && intents.includes(h.intent_key)) ?? null;
      // Skip-ahead: this box has no line for the reply, but the if/else right
      // after it (or one of its own reply connectors) does — pass through
      // silently and let the branch fire.
      if (!match && (nextIfElseRecognizes(target.id) || (!pathExpected && connectorRecognizes(target.id)))) {
        currentNodeId = target.id;
        note("", target, ct, edgeCond, null, "skipped_ahead");
        continue;
      }
      if (reactiveCanHandle && !pathExpected && !match) return defer(target.label || ct);
      scenario = match ?? handlerById(target.scenario_id) ?? handlerById(cands[0]);
    } else if (ct === "collection") {
      const ids = cfg.collectionId ? await getCollectionHandlerIds(cfg.collectionId as string).catch(() => []) : [];
      // Keep the customer's order of points: sort matches by intent position.
      const matches = allHandlers
        .filter((h) => ids.includes(h.id) && intents.includes(h.intent_key))
        .sort((a, b) => intents.indexOf(a.intent_key) - intents.indexOf(b.intent_key));
      // Else-collection fallback: when no member fits, a second collection
      // (e.g. neutral edge cases) gets a chance before the default line.
      let elseMatches: ListenerHandler[] = [];
      if (matches.length === 0 && cfg.elseCollectionId) {
        const eids = await getCollectionHandlerIds(cfg.elseCollectionId as string).catch(() => [] as string[]);
        elseMatches = allHandlers
          .filter((h) => eids.includes(h.id) && h.enabled && intents.includes(h.intent_key))
          .sort((a, b) => intents.indexOf(a.intent_key) - intents.indexOf(b.intent_key));
      }
      const effective = matches.length > 0 ? matches : elseMatches;
      if (effective.length === 0 && (nextIfElseRecognizes(target.id) || (!pathExpected && connectorRecognizes(target.id)))) {
        currentNodeId = target.id;
        note("", target, ct, edgeCond, null, "skipped_ahead");
        continue;
      }
      if (reactiveCanHandle && !pathExpected && effective.length === 0) return defer(target.label || ct);
      if (effective.length > 1) {
        mergedText =
          `The customer raised ${effective.length} points at once — cover ALL of them in ONE short, natural reply (a single paragraph, keep exact facts, prices and terms word-accurate): ` +
          effective.map((m, i) => `(${i + 1}) ${m.response_template}`).join(" ");
        mergedIds = effective.map((m) => m.id);
      }
      // No member fits the reply → the box's default line if one is set;
      // otherwise NOTHING is picked and the stage-guidance briefing grounds
      // the agent. Never blind-pick a member: a live call once answered a
      // plain "yes" with "It's Victor from Lucky Seven" because the
      // highest-priority member happened to be the who-is-calling reply.
      scenario = effective.length > 0 ? effective[0] : handlerById(target.scenario_id) ?? null;
      stageMemberNames = allHandlers.filter((h) => ids.includes(h.id) && h.enabled).map((h) => h.name);
    } else {
      // send_sms / transfer
      scenario = handlerById(target.scenario_id);
      if (reactiveCanHandle && !pathExpected && !(scenario && intents.includes(scenario.intent_key))) return defer(target.label || ct);
    }

    if (await staleNow()) return true;
    // Speaking lock: if the agent is mid-sentence, wait for it to finish —
    // the line then lands as a continuation instead of an overlap.
    await waitForAgentSilence(callId);
    if (await staleNow()) return true;
    currentNodeId = target.id;
    // One response per customer turn: if the agent already answered naturally
    // while this step was in flight, the line continues that reply instead of
    // starting a second one — quoting its own words back so it can't restart
    // ("This is Tom with Lucky's. I'm Tom with Lucky Seven, and…").
    const [alreadyReplied, deliveredRows] = await Promise.all([
      utteranceEventId != null ? agentSpokeSince(callId, utteranceEventId).catch(() => false) : Promise.resolve(false),
      getDeliveredHandlers(callId).catch(() => [] as { handler_id: string; count: number }[]),
    ]);
    const spokenSince =
      alreadyReplied && utteranceEventId != null
        ? await agentWordsSince(callId, utteranceEventId).catch(() => null)
        : null;
    // Anti-repeat ledger: loop-backs and re-visited stages must rephrase, and
    // finished topics stay closed unless the customer re-opens them.
    const priorRepeats = scenario ? (deliveredRows.find((r) => r.handler_id === scenario.id)?.count ?? 0) : 0;
    const coveredNames = deliveredRows
      .filter((r) => r.handler_id !== scenario?.id)
      .map((r) => allHandlers.find((h) => h.id === r.handler_id)?.name)
      .filter((n): n is string => !!n)
      .slice(0, 4);
    const coveredLine = coveredNames.length
      ? ` (Earlier in this call you already covered: ${coveredNames.join("; ")} — don't re-open those unless asked.)`
      : "";
    const repeatLine =
      priorRepeats > 0
        ? ` (You've already said this ${priorRepeats === 1 ? "once" : `${priorRepeats} times`} this call — don't recite it again: much shorter, new emphasis or one new detail. E.g. a second self-introduction stresses the COMPANY, not your name.)`
        : "";
    // Ground briefings in the customer's actual words — the step should feel
    // like a reply to them, not a recital of the next script line. The clamp
    // at the end is load-bearing: without it the model appends invented
    // follow-up questions after delivering the line.
    const brief = (t: string) =>
      (alreadyReplied
        ? `You already started replying${spokenSince ? ` — your words so far: "${spokenSince}"` : ""}. Continue seamlessly from where you left off with ONLY the following — do not repeat or rephrase anything you already said, do not introduce yourself again, do not re-acknowledge (keep facts, prices and terms word-accurate): ${t}`
        : `The customer just said: "${utterance.slice(0, 140)}" — open with at most ONE filler from your approved list (or none), then deliver: ${t}`) +
      " Deliver ONLY that, then stop — no added follow-up question of your own; the script decides what comes next." +
      repeatLine +
      coveredLine;
    let injectedText = "";
    if (ct === "send_sms") {
      injectedText = scenario?.response_template || "The SMS with the details is on its way. Confirm that to the customer.";
    } else if (ct === "transfer") {
      injectedText = scenario?.response_template || "Thanks — let me connect you to one of our team now.";
    } else if (mergedText) {
      injectedText = mergedText;
    } else if (scenario) {
      injectedText = scenario.response_template ?? "";
    }

    // Additional statements: author-attached lines that ALWAYS ride along
    // with this box's response — appended in order, same single reply.
    const extraStatements = ((cfg.statements as string[]) ?? []).map((s) => (s ?? "").trim()).filter(Boolean);
    if (extraStatements.length) {
      injectedText = [injectedText, ...extraStatements].filter(Boolean).join(" ");
    }

    // A collection entered with nothing specific to say (no default line, no
    // matching member) must NOT leave the agent to improvise — the model
    // invents facts ("I can see you've been pretty active"). Ground it.
    let stageGuidance = false;
    if (!injectedText && ct === "collection") {
      injectedText =
        `You've just moved into the "${target.label || "next"}" part of the call` +
        (stageMemberNames.length ? ` — it exists to handle: ${stageMemberNames.slice(0, 4).join("; ")}` : "") +
        `. Bridge into it with ONE short, neutral sentence. Never invent facts, activity, or offers, and ask nothing.`;
      stageGuidance = true;
    }

    // The reply often carries MORE than the routed step expects ("sure, text
    // me — but what's the catch?"): fold every OTHER matched Playbook answer
    // into the same briefing so the agent gives ONE unified reply and no part
    // of the customer's turn is silently dropped.
    let sideMerged = false;
    if (ct !== "transfer") {
      const covered = new Set<string>([...(scenario ? [scenario.id] : []), ...mergedIds]);
      const sideAnswers: ListenerHandler[] = [];
      for (const k of intents) {
        if (consumedIntents.has(k)) continue; // the routing itself answers these
        const h = allHandlers.find((x) => x.intent_key === k);
        if (!h || covered.has(h.id)) continue;
        if (h.action_type !== "answer" && h.action_type !== "give_offer") continue;
        if (!h.response_template) continue;
        covered.add(h.id);
        sideAnswers.push(h);
      }
      if (sideAnswers.length > 0 && injectedText) {
        const parts = [injectedText, ...sideAnswers.map((h) => h.response_template)];
        injectedText =
          `The customer raised ${parts.length} points at once — cover ALL of them in ONE short, natural reply (a single paragraph, keep exact facts, prices and terms word-accurate): ` +
          parts.map((t, i) => `(${i + 1}) ${t}`).join(" ");
        sideMerged = true;
      }
    }

    note(injectedText, target, ct, edgeCond, scenario?.id ?? null, alreadyReplied ? "continue_after_reply" : "fresh", {
      repeated: priorRepeats,
      covered: coveredNames.length,
    });
    if (!(await flush())) return true; // lost the race — say nothing
    if (ct === "send_sms") {
      // Honesty in the timeline: no SMS provider is wired yet — the send is
      // SIMULATED. Real sends need Twilio (or similar) plus a phone-call
      // customer number; browser test calls have neither.
      await log({
        call_id: callId,
        event_type: "sms",
        content: "SIMULATED — no SMS provider wired; nothing was actually sent.",
        handler_id: scenario?.id ?? null,
        meta: { simulated: true },
      });
    }
    const controlUrl = await ctl();
    if (controlUrl) {
      if (ct === "send_sms") {
        await injectStaffNote(controlUrl, brief(injectedText), true);
      } else if (ct === "transfer") {
        await injectSay(controlUrl, injectedText, false);
      } else if (mergedText || sideMerged || stageGuidance) {
        // Merged multi-point replies and stage guidance are always briefings.
        await injectStaffNote(controlUrl, brief(injectedText), true);
      } else if (scenario) {
        // A verbatim say after the agent's own reply would restate/re-ask on
        // top of it, and a repeated line must never be spoken word-for-word
        // again — both become continuation notes.
        scenario.delivery === "verbatim" && !alreadyReplied && priorRepeats === 0
          ? await injectSay(controlUrl, injectedText, false)
          : await injectStaffNote(controlUrl, brief(injectedText), true);
      }
    }
    return true;
  }
  return false;
}
