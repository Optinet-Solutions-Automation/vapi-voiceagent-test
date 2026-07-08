// Two sample scripts for the connector-era Script Builder — the reference
// shapes for building campaigns:
//
//   "Sample — Basic Call": Start → (customer agrees) → pitch line → End;
//   anything else ends the call. The minimal strict script.
//
//   "Sample — Advanced Call": two connectors into one Collection stage
//   (agreement AND offer-questions both land there), the collection answers
//   its member Q&A in place with an Else line for everything unmatched, a
//   repeat-request loops the stage back to itself, consent routes to a Send
//   SMS box, and every catch-all falls through to End.
//
// Everything uses reply connectors + catch-alls: no If/Else, no Loop boxes.
// Connector matchers are routing plumbing (action=ignore, never in any
// collection); spoken lines are normal scenarios tagged with the script name.
//
// Idempotent: re-running deletes and recreates both samples. Run:
//   node scripts/seed-connector-samples.mjs
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const sb = createClient(
  "https://mfnebrospbqhbrxfexie.supabase.co",
  "sb_publishable_0CSebHk0k2ToTg7-F4KeDA_ZjRpz7q5"
);

const BASIC = "Sample — Basic Call";
const ADV = "Sample — Advanced Call";
const COLLECTION = "Sample — Discovery Q&A";

// ── Scenarios (matchers route, lines speak) ───────────────────
const SCENARIOS = [
  // Basic
  { name: "Sample — customer agrees", intent_key: "sample_basic_yes", tags: [BASIC, "Reply detector"], description: "The customer agrees or confirms — yes, yeah, sure, okay, sounds good, go ahead.", response_template: "", action_type: "ignore", delivery: "verbatim", mode: "listener", priority: 100 },
  // Lines never START with an acknowledgement ("Great —") — the agent adds
  // its own approved filler, and an ack-prefixed line stacks into "Nice.
  // Love to hear it. Great." triple-acks.
  { name: "Sample — the pitch", intent_key: "sample_basic_pitch", tags: [BASIC], description: "SPEAK-ONLY: the sample pitch line, delivered by the script. Not a customer reply.", response_template: "Quick heads up: there's a welcome discount already sitting on your account this week. You just log in and it's applied automatically, nothing to pay.", action_type: "answer", delivery: "reword", mode: "both", priority: 100 },
  { name: "Sample — goodbye", intent_key: "sample_goodbye", tags: [BASIC, ADV], description: "SPEAK-ONLY: the sample goodbye line. Not a customer reply.", response_template: "Thanks for your time today — have a great one. Goodbye!", action_type: "answer", delivery: "verbatim", mode: "both", priority: 100 },
  // Advanced — matchers
  { name: "Sample — shows interest", intent_key: "sample_adv_interested", tags: [ADV, "Reply detector"], description: "The customer agrees, confirms, or sounds open to hearing more — yes, sure, okay, go on, tell me more.", response_template: "", action_type: "ignore", delivery: "verbatim", mode: "listener", priority: 100 },
  { name: "Sample — asks about the offer", intent_key: "sample_adv_question", tags: [ADV, "Reply detector"], description: "The customer asks a question about the offer or the call — what is this, what's it about, what do you want, details.", response_template: "", action_type: "ignore", delivery: "verbatim", mode: "listener", priority: 100 },
  { name: "Sample — agrees to the text", intent_key: "sample_adv_text_yes", tags: [ADV, "Reply detector"], description: "The customer agrees to receive the text or link — yes send it, text me, sure send the link.", response_template: "", action_type: "ignore", delivery: "verbatim", mode: "listener", priority: 100 },
  { name: "Sample — asks to repeat", intent_key: "sample_adv_repeat", tags: [ADV, "Reply detector"], description: "The customer didn't catch it or asks to repeat — say that again, what was that, sorry?", response_template: "", action_type: "ignore", delivery: "verbatim", mode: "listener", priority: 100 },
  // Advanced — collection members (real Q&A lines)
  { name: "Sample — what's it about?", intent_key: "sample_qa_about", tags: [ADV, "Q&A"], description: "Customer asks what this is about or why you're calling.", response_template: "It's a quick courtesy call about the account you created with us — there's a welcome discount on it this week and I wanted to make sure you don't miss it.", action_type: "answer", delivery: "reword", mode: "both", priority: 20 },
  { name: "Sample — how much is it?", intent_key: "sample_qa_cost", tags: [ADV, "Q&A"], description: "Customer asks about price, cost, or what they'd have to pay.", response_template: "Nothing to pay — the discount is already applied to your account; you just log in to see it.", action_type: "answer", delivery: "verbatim", mode: "both", priority: 21 },
  { name: "Sample — is this legit?", intent_key: "sample_qa_legit", tags: [ADV, "Q&A"], description: "Customer is suspicious — asks if this is real, a scam, or too good to be true.", response_template: "Totally fair to check — I'm not asking for any payment or card details. You can log in directly yourself, without any link from me, and see it on your account.", action_type: "answer", delivery: "reword", mode: "both", priority: 22 },
  // Advanced — else line + SMS confirmation
  { name: "Sample — discovery else line", intent_key: "sample_adv_else", tags: [ADV], description: "SPEAK-ONLY: spoken at the discovery stage when no Q&A member fits the reply. Not a customer reply.", response_template: "Quick version: your account has a welcome discount waiting this week. I can text you the direct link — want me to send it over?", action_type: "answer", delivery: "reword", mode: "both", priority: 100 },
  { name: "Sample — SMS confirmation", intent_key: "sample_adv_sms", tags: [ADV], description: "SPEAK-ONLY: the dispatch confirmation spoken as the sample SMS goes out. Not a customer reply.", response_template: "The text with your link is going out right now — it'll be from us, arriving in a few seconds.", action_type: "send_sms", delivery: "verbatim", mode: "both", priority: 100 },
];

// ── Wipe previous copies (scripts, their nodes/edges, sample rows) ──
const KEYS = SCENARIOS.map((s) => s.intent_key);
const { data: oldScripts } = await sb.from("listener_scripts").select("id").in("name", [BASIC, ADV]);
const oldIds = (oldScripts ?? []).map((s) => s.id);
if (oldIds.length) {
  await sb.from("listener_script_edges").delete().in("script_id", oldIds);
  await sb.from("listener_script_nodes").delete().in("script_id", oldIds);
  await sb.from("lab_call_flow_state").delete().in("script_id", oldIds);
  await sb.from("listener_scripts").delete().in("id", oldIds);
}
const { data: oldHandlers } = await sb.from("listener_handlers").select("id").in("intent_key", KEYS);
const oldHids = (oldHandlers ?? []).map((h) => h.id);
if (oldHids.length) {
  await sb.from("listener_collection_handlers").delete().in("handler_id", oldHids);
  await sb.from("listener_handlers").delete().in("id", oldHids);
}
await sb.from("listener_collections").delete().eq("name", COLLECTION);

// ── Create scenarios ──────────────────────────────────────────
const byKey = {};
for (const s of SCENARIOS) {
  const { data, error } = await sb.from("listener_handlers").insert({ ...s, enabled: true }).select().single();
  if (error) { console.log("FAILED scenario", s.intent_key, error.message); process.exit(1); }
  byKey[s.intent_key] = data;
}

// ── The sample collection (Q&A members only — matchers never join) ──
const { data: col, error: colErr } = await sb
  .from("listener_collections")
  .insert({ name: COLLECTION, description: "The advanced sample's discovery stage: the questions it can answer in place." })
  .select()
  .single();
if (colErr) { console.log("FAILED collection:", colErr.message); process.exit(1); }
await sb.from("listener_collection_handlers").insert(
  ["sample_qa_about", "sample_qa_cost", "sample_qa_legit"].map((k) => ({ collection_id: col.id, handler_id: byKey[k].id }))
);

// ── Graph helpers ─────────────────────────────────────────────
const conn = (intentKey, label, any = false) => ({ id: "c:" + randomUUID(), intentKey: any ? "" : intentKey, label, ...(any ? { any: true } : {}) });
const node = (script_id, type, label, config, scenarioKey, x, y) => ({
  id: randomUUID(), script_id, type, label, config, scenario_id: scenarioKey ? byKey[scenarioKey].id : null, pos_x: x, pos_y: y,
});
const edgeFor = (script_id, from, connector, to) => ({
  id: randomUUID(), script_id, source_node_id: from.id, target_node_id: to.id, label: "",
  condition: connector.any ? { kind: "any", handle: connector.id } : { kind: "intent", by: "intent", value: connector.intentKey, handle: connector.id },
});

// ── Basic sample ──────────────────────────────────────────────
const { data: basic } = await sb.from("listener_scripts").insert({ name: BASIC, description: "The minimal strict script: agree → pitch → end; anything else ends the call." }).select().single();
{
  const cYes = conn("sample_basic_yes", "Sample — customer agrees");
  const cElse = conn(null, "anything else", true);
  const cAfter = conn(null, "anything else", true);
  const start = node(basic.id, "start", "Start call", { mode: "agent_first", opening: "Hi, this is Alex from BrightPath — quick question: have you had a chance to look at your account this week?", connectors: [cYes, cElse] }, null, 260, 40);
  const pitch = node(basic.id, "step", "The pitch", { contentType: "scenario", connectors: [cAfter] }, "sample_basic_pitch", 80, 260);
  const end = node(basic.id, "step", "End call", { contentType: "end" }, "sample_goodbye", 320, 470);
  await sb.from("listener_script_nodes").insert([start, pitch, end]);
  await sb.from("listener_script_edges").insert([
    edgeFor(basic.id, start, cYes, pitch),
    edgeFor(basic.id, start, cElse, end),
    edgeFor(basic.id, pitch, cAfter, end),
  ]);
}

// ── Advanced sample ───────────────────────────────────────────
const { data: adv } = await sb.from("listener_scripts").insert({ name: ADV, description: "Collections + connectors showcase: two routes into one discovery stage, in-place Q&A with an Else line, a repeat loop-back, SMS consent, catch-alls to End." }).select().single();
{
  const cInterested = conn("sample_adv_interested", "Sample — shows interest");
  const cQuestion = conn("sample_adv_question", "Sample — asks about the offer");
  const cStartElse = conn(null, "anything else", true);
  const cTextYes = conn("sample_adv_text_yes", "Sample — agrees to the text");
  const cRepeat = conn("sample_adv_repeat", "Sample — asks to repeat");
  const cStageElse = conn(null, "anything else", true);
  const cAfterSms = conn(null, "anything else", true);
  const start = node(adv.id, "start", "Start call", { mode: "agent_first", opening: "Hi, this is Alex from BrightPath — do you have a quick minute? It's about the account you set up with us.", connectors: [cInterested, cQuestion, cStartElse] }, null, 300, 40);
  const stage = node(adv.id, "step", "Discovery stage", { contentType: "collection", collectionId: col.id, connectors: [cTextYes, cRepeat, cStageElse] }, "sample_adv_else", 160, 280);
  const sms = node(adv.id, "step", "Send the link", { contentType: "send_sms", connectors: [cAfterSms] }, "sample_adv_sms", 40, 540);
  const end = node(adv.id, "step", "End call", { contentType: "end" }, "sample_goodbye", 480, 540);
  await sb.from("listener_script_nodes").insert([start, stage, sms, end]);
  await sb.from("listener_script_edges").insert([
    edgeFor(adv.id, start, cInterested, stage),
    edgeFor(adv.id, start, cQuestion, stage), // two routes into one stage
    edgeFor(adv.id, start, cStartElse, end),
    edgeFor(adv.id, stage, cTextYes, sms),
    edgeFor(adv.id, stage, cRepeat, stage), // loop-back: repeat the stage
    edgeFor(adv.id, stage, cStageElse, end),
    edgeFor(adv.id, sms, cAfterSms, end),
  ]);
}

console.log(`Created "${BASIC}" (3 boxes) and "${ADV}" (4 boxes, loop-back, Else line).`);
console.log(`Collection "${COLLECTION}" holds the 3 Q&A members; connector matchers stay out of collections.`);
console.log("Open them in the Script Builder — the active script setting was not changed.");
