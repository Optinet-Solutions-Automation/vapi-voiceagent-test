// Two sample scripts for the connector-era Script Builder — the reference
// shapes for building campaigns, showcasing the full current feature set:
//
//   "Sample — Basic Call": Start (Exact-line opening) → (customer agrees) →
//   pitch line carrying TWO additional statements → End (exact goodbye);
//   anything else ends the call. The minimal strict script.
//
//   "Sample — Advanced Call": REWORDED opening (the agent phrases the meaning
//   in its own words); two connectors into one Collection stage (agreement
//   AND offer-questions both land there); the collection answers its member
//   Q&A in place, falls back to a second collection (Common Objections) when
//   no member fits, and only then to its written Else line; a repeat-request
//   loops the stage back to itself; consent routes to a Send SMS box carrying
//   two compliance/UX statements; the End goodbye is REWORDED and carries a
//   statement of its own; every catch-all falls through to End.
//
// Everything uses reply connectors + catch-alls: no If/Else, no Loop boxes.
// Connector matchers are routing plumbing (action=ignore, never in any
// collection); spoken lines are normal scenarios tagged with the script name.
// Lines never START with an acknowledgement — the agent's approved filler
// owns that slot.
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
const OBJECTIONS = "Sample — Common Objections";

// ── Scenarios (matchers route, lines speak) ───────────────────
const SCENARIOS = [
  // Basic
  { name: "Sample — customer agrees", intent_key: "sample_basic_yes", tags: [BASIC, "Reply detector"], description: "The customer agrees or confirms — yes, yeah, sure, okay, sounds good, go ahead.", response_template: "", action_type: "ignore", delivery: "verbatim", mode: "listener", priority: 100 },
  // Lines never START with an acknowledgement ("Great —") — the agent adds
  // its own approved filler, and an ack-prefixed line stacks into "Nice.
  // Love to hear it. Great." triple-acks.
  { name: "Sample — the pitch", intent_key: "sample_basic_pitch", tags: [BASIC], description: "SPEAK-ONLY: the sample pitch line, delivered by the script. Not a customer reply.", response_template: "Quick heads up: there's a welcome discount already sitting on your account this week. You just log in and it's applied automatically, nothing to pay.", action_type: "answer", delivery: "reword", mode: "both", priority: 100 },
  { name: "Sample — goodbye", intent_key: "sample_goodbye", tags: [BASIC], description: "SPEAK-ONLY: the sample goodbye line, spoken word-for-word. Not a customer reply.", response_template: "Thanks for your time today — have a great one. Goodbye!", action_type: "answer", delivery: "verbatim", mode: "both", priority: 100 },
  { name: "Sample — warm goodbye (reworded)", intent_key: "sample_goodbye_warm", tags: [ADV], description: "SPEAK-ONLY: the advanced sample's goodbye, delivered in the agent's own words. Not a customer reply.", response_template: "Thank them for their time and wish them a good rest of the day.", action_type: "answer", delivery: "reword", mode: "both", priority: 100 },
  // Common Objections — the advanced stage's fallback collection.
  { name: "Sample — not interested", intent_key: "sample_obj_not_interested", tags: [ADV, "Objections"], description: "Customer declines or isn't interested — no thanks, not for me, stop pitching.", response_template: "No pressure at all — the discount just stays on the account through Sunday if you change your mind.", action_type: "answer", delivery: "reword", mode: "both", priority: 30 },
  { name: "Sample — busy right now", intent_key: "sample_obj_busy", tags: [ADV, "Objections"], description: "Customer is busy or asks to talk later — bad timing, driving, at work, call me later.", response_template: "It takes under a minute whenever suits you — everything is already sitting on the account.", action_type: "answer", delivery: "reword", mode: "both", priority: 31 },
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
await sb.from("listener_collections").delete().in("name", [COLLECTION, OBJECTIONS]);

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

// The fallback collection: unmatched replies at the stage get a second chance
// against these before the written Else line.
const { data: objCol, error: objErr } = await sb
  .from("listener_collections")
  .insert({ name: OBJECTIONS, description: "The advanced sample's fallback: objections the discovery stage handles when no Q&A member fits." })
  .select()
  .single();
if (objErr) { console.log("FAILED objections collection:", objErr.message); process.exit(1); }
await sb.from("listener_collection_handlers").insert(
  ["sample_obj_not_interested", "sample_obj_busy"].map((k) => ({ collection_id: objCol.id, handler_id: byKey[k].id }))
);

// ── Graph helpers ─────────────────────────────────────────────
const conn = (intentKey, label, any = false, quickWords = null) => ({ id: "c:" + randomUUID(), intentKey: any ? "" : intentKey, label, ...(any ? { any: true } : {}), ...(quickWords ? { quickWords } : {}) });
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
  const cYes = conn("sample_basic_yes", "Sample — customer agrees", false, "yes, yeah, yup, sure, okay, ok");
  const cElse = conn(null, "anything else", true);
  const cAfter = conn(null, "anything else", true);
  const start = node(basic.id, "start", "Start call", { mode: "agent_first", opening: "Hi, this is Alex from BrightPath — quick question: have you had a chance to look at your account this week?", openingDelivery: "verbatim", connectors: [cYes, cElse] }, null, 260, 40);
  // Two additional statements ride along with the pitch — same single reply.
  const pitch = node(basic.id, "step", "The pitch", { contentType: "scenario", statements: ["Also — there's nothing to pay; the discount is already applied.", "It's only live until Sunday, so it's worth a quick look."], connectors: [cAfter] }, "sample_basic_pitch", 80, 260);
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
  const cInterested = conn("sample_adv_interested", "Sample — shows interest", false, "yes, yeah, yup, sure, okay, ok");
  const cQuestion = conn("sample_adv_question", "Sample — asks about the offer");
  const cStartElse = conn(null, "anything else", true);
  const cTextYes = conn("sample_adv_text_yes", "Sample — agrees to the text", false, "yes, yeah, sure, okay, ok");
  const cRepeat = conn("sample_adv_repeat", "Sample — asks to repeat");
  const cStageElse = conn(null, "anything else", true);
  const cAfterSms = conn(null, "anything else", true);
  // Reworded opening: the agent phrases this meaning in its own words.
  const start = node(adv.id, "start", "Start call", { mode: "agent_first", opening: "Hi, this is Alex from BrightPath — do you have a quick minute? It's about the account you set up with us.", openingDelivery: "reword", connectors: [cInterested, cQuestion, cStartElse] }, null, 300, 40);
  // Fallback ladder at the stage: members → Common Objections collection →
  // the written Else line → automatic briefing.
  const stage = node(adv.id, "step", "Discovery stage", { contentType: "collection", collectionId: col.id, elseCollectionId: objCol.id, connectors: [cTextYes, cRepeat, cStageElse] }, "sample_adv_else", 160, 280);
  // Compliance/UX statements ride along with the SMS confirmation.
  const sms = node(adv.id, "step", "Send the link", { contentType: "send_sms", statements: ["Standard message rates may apply.", "If it doesn't arrive within a minute, just say so and it goes out again."], connectors: [cAfterSms] }, "sample_adv_sms", 40, 540);
  // Reworded goodbye, with a statement of its own.
  const end = node(adv.id, "step", "End call", { contentType: "end", statements: ["Everything mentioned is visible in the account anytime."] }, "sample_goodbye_warm", 480, 540);
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

console.log(`Created "${BASIC}" (3 boxes: exact opening, pitch + 2 statements, exact goodbye).`);
console.log(`Created "${ADV}" (4 boxes: reworded opening, stage with member Q&A → "${OBJECTIONS}" fallback → Else line, loop-back, SMS + 2 statements, reworded goodbye + statement).`);
console.log(`Collections: "${COLLECTION}" (3 Q&A members) and "${OBJECTIONS}" (2 fallbacks); connector matchers stay out of collections.`);
console.log("Open them in the Script Builder — the active script setting was not changed.");
