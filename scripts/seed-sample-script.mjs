// Seeds a sample Script (visual call-flow) so the Script Builder has something
// to open: Start → Offer → Branch → (Send SMS | Objection) → Close.
// Idempotent: rebuilds the graph for the script named below each run.
// Run: node scripts/seed-sample-script.mjs
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const sb = createClient(
  "https://mfnebrospbqhbrxfexie.supabase.co",
  "sb_publishable_0CSebHk0k2ToTg7-F4KeDA_ZjRpz7q5"
);

const SCRIPT_NAME = "Sample — Offer Flow";

const { data: scenarios } = await sb.from("listener_handlers").select("id, intent_key");
const byIntent = Object.fromEntries((scenarios ?? []).map((s) => [s.intent_key, s.id]));
const scn = (k) => byIntent[k] ?? null;

// Find or create the script
let { data: existing } = await sb.from("listener_scripts").select("id").eq("name", SCRIPT_NAME).maybeSingle();
let scriptId = existing?.id;
if (!scriptId) {
  const { data, error } = await sb
    .from("listener_scripts")
    .insert({ name: SCRIPT_NAME, description: "Auto-seeded example flow." })
    .select()
    .single();
  if (error) {
    console.log("FAILED to create script:", error.message);
    process.exit(1);
  }
  scriptId = data.id;
}

// Node IDs
const nStart = randomUUID();
const nOffer = randomUUID();
const nBranch = randomUUID();
const nSms = randomUUID();
const nObjection = randomUUID();
const nEnd = randomUUID();

const nodes = [
  { id: nStart, script_id: scriptId, type: "start", scenario_id: scn("first_message"), label: "Start (agent opens)", config: { mode: "agent_first" }, pos_x: 280, pos_y: 32 },
  { id: nOffer, script_id: scriptId, type: "say", scenario_id: scn("main_offer"), label: "Give Offer", config: {}, pos_x: 280, pos_y: 160 },
  { id: nBranch, script_id: scriptId, type: "switch", scenario_id: null, label: "Their response?", config: {}, pos_x: 280, pos_y: 288 },
  { id: nSms, script_id: scriptId, type: "send_sms", scenario_id: scn("sms_consent"), label: "Send SMS", config: {}, pos_x: 80, pos_y: 432 },
  { id: nObjection, script_id: scriptId, type: "say", scenario_id: scn("not_interested_soft"), label: "Handle Objection", config: {}, pos_x: 480, pos_y: 432 },
  { id: nEnd, script_id: scriptId, type: "end", scenario_id: scn("goodbye"), label: "Close", config: {}, pos_x: 280, pos_y: 576 },
];

const edges = [
  { id: randomUUID(), script_id: scriptId, source_node_id: nStart, target_node_id: nOffer, condition: { kind: "always" }, label: "always" },
  { id: randomUUID(), script_id: scriptId, source_node_id: nOffer, target_node_id: nBranch, condition: { kind: "always" }, label: "always" },
  { id: randomUUID(), script_id: scriptId, source_node_id: nBranch, target_node_id: nSms, condition: { kind: "intent", value: "sms_consent" }, label: "intent: sms_consent" },
  { id: randomUUID(), script_id: scriptId, source_node_id: nBranch, target_node_id: nObjection, condition: { kind: "intent", value: "not_interested_soft" }, label: "intent: not_interested_soft" },
  { id: randomUUID(), script_id: scriptId, source_node_id: nBranch, target_node_id: nEnd, condition: { kind: "else" }, label: "otherwise" },
  { id: randomUUID(), script_id: scriptId, source_node_id: nSms, target_node_id: nEnd, condition: { kind: "always" }, label: "always" },
  { id: randomUUID(), script_id: scriptId, source_node_id: nObjection, target_node_id: nEnd, condition: { kind: "always" }, label: "always" },
];

// Rebuild graph (edges first due to FK, then nodes)
await sb.from("listener_script_edges").delete().eq("script_id", scriptId);
await sb.from("listener_script_nodes").delete().eq("script_id", scriptId);
const ni = await sb.from("listener_script_nodes").insert(nodes);
if (ni.error) {
  console.log("FAILED nodes:", ni.error.message);
  process.exit(1);
}
const ei = await sb.from("listener_script_edges").insert(edges);
if (ei.error) {
  console.log("FAILED edges:", ei.error.message);
  process.exit(1);
}

console.log(`Seeded "${SCRIPT_NAME}" — ${nodes.length} boxes, ${edges.length} arrows. Open it in Script Builder.`);
