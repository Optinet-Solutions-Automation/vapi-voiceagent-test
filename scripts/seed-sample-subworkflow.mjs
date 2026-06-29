// Seeds a sample sub-workflow and a main script that branches on its result,
// to demonstrate the Script Builder's sub-workflow + result-branch feature.
//
//   Sub — Introduction:  Start → Intro line → (branch on reply)
//        → End[result=qualified] | End[result=not_qualified] | End[result=unknown]
//
//   Main — With Intro Sub:  Start → run Sub-Introduction
//        → (branch on result) qualified→Give Offer→Close | not_qualified→Close | else→Close
//
// Idempotent: rebuilds both scripts each run. Run: node scripts/seed-sample-subworkflow.mjs
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const sb = createClient(
  "https://mfnebrospbqhbrxfexie.supabase.co",
  "sb_publishable_0CSebHk0k2ToTg7-F4KeDA_ZjRpz7q5"
);

const { data: scenarios } = await sb.from("listener_handlers").select("id, intent_key");
const scn = (k) => (scenarios ?? []).find((s) => s.intent_key === k)?.id ?? null;

async function getOrCreateScript(name, description) {
  const { data: existing } = await sb.from("listener_scripts").select("id").eq("name", name).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await sb.from("listener_scripts").insert({ name, description }).select().single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function rebuild(scriptId, nodes, edges) {
  await sb.from("listener_script_edges").delete().eq("script_id", scriptId);
  await sb.from("listener_script_nodes").delete().eq("script_id", scriptId);
  const ni = await sb.from("listener_script_nodes").insert(nodes.map((n) => ({ ...n, script_id: scriptId })));
  if (ni.error) throw new Error("nodes: " + ni.error.message);
  const ei = await sb.from("listener_script_edges").insert(edges.map((e) => ({ ...e, script_id: scriptId })));
  if (ei.error) throw new Error("edges: " + ei.error.message);
}

// ── Sub-workflow: Introduction ────────────────────────────────
const subId = await getOrCreateScript("Sub — Introduction", "Reusable intro that returns qualified / not_qualified.");

const sStart = randomUUID(), sIntro = randomUUID(), sQual = randomUUID(), sNot = randomUUID(), sUnk = randomUUID();
const subNodes = [
  { id: sStart, type: "start", scenario_id: null, label: "Start", config: { mode: "agent_first" }, pos_x: 300, pos_y: 24 },
  { id: sIntro, type: "step", scenario_id: scn("first_message"), label: "Intro line", config: { contentType: "scenario" }, pos_x: 300, pos_y: 150 },
  { id: sQual, type: "step", scenario_id: null, label: "Qualified", config: { contentType: "return", resultName: "qualified" }, pos_x: 90, pos_y: 300 },
  { id: sNot, type: "step", scenario_id: null, label: "Not qualified", config: { contentType: "return", resultName: "not_qualified" }, pos_x: 300, pos_y: 320 },
  { id: sUnk, type: "step", scenario_id: null, label: "Unknown", config: { contentType: "return", resultName: "unknown" }, pos_x: 510, pos_y: 300 },
];
const subEdges = [
  { id: randomUUID(), source_node_id: sStart, target_node_id: sIntro, condition: { kind: "plain" }, label: "" },
  { id: randomUUID(), source_node_id: sIntro, target_node_id: sQual, condition: { kind: "branch", by: "intent", value: "main_offer" }, label: "if intent: main_offer" },
  { id: randomUUID(), source_node_id: sIntro, target_node_id: sNot, condition: { kind: "branch", by: "intent", value: "not_interested_soft" }, label: "if intent: not_interested_soft" },
  { id: randomUUID(), source_node_id: sIntro, target_node_id: sUnk, condition: { kind: "branch", by: "else" }, label: "otherwise" },
];
await rebuild(subId, subNodes, subEdges);

// ── Main script: With Intro Sub ───────────────────────────────
const mainId = await getOrCreateScript("Main — With Intro Sub", "Runs the intro sub-workflow, then branches on its result.");

const mStart = randomUUID(), mSub = randomUUID(), mOffer = randomUUID(), mClose = randomUUID();
const mainNodes = [
  { id: mStart, type: "start", scenario_id: null, label: "Start", config: { mode: "agent_first" }, pos_x: 300, pos_y: 24 },
  { id: mSub, type: "step", scenario_id: null, label: "Run Introduction", config: { contentType: "subworkflow", subworkflowId: subId }, pos_x: 300, pos_y: 150 },
  { id: mOffer, type: "step", scenario_id: scn("main_offer"), label: "Give Offer", config: { contentType: "scenario" }, pos_x: 110, pos_y: 300 },
  { id: mClose, type: "step", scenario_id: scn("goodbye"), label: "Close", config: { contentType: "end" }, pos_x: 360, pos_y: 460 },
];
const mainEdges = [
  { id: randomUUID(), source_node_id: mStart, target_node_id: mSub, condition: { kind: "plain" }, label: "" },
  { id: randomUUID(), source_node_id: mSub, target_node_id: mOffer, condition: { kind: "branch", by: "result", value: "qualified" }, label: "if result: qualified" },
  { id: randomUUID(), source_node_id: mSub, target_node_id: mClose, condition: { kind: "branch", by: "result", value: "not_qualified" }, label: "if result: not_qualified" },
  { id: randomUUID(), source_node_id: mSub, target_node_id: mClose, condition: { kind: "branch", by: "else" }, label: "otherwise" },
  { id: randomUUID(), source_node_id: mOffer, target_node_id: mClose, condition: { kind: "plain" }, label: "" },
];
await rebuild(mainId, mainNodes, mainEdges);

console.log("Seeded:");
console.log('  • "Sub — Introduction" (returns qualified / not_qualified / unknown)');
console.log('  • "Main — With Intro Sub" (branches on the sub-workflow result)');
console.log("Open the Script Builder and pick either to see it.");
