// Seeds "Demo — Basic Welcome Call": the simple, readable script for a first
// presentation. One screen, seven boxes, no sub-workflows:
//
//   Start → Offer the promo → Said yes? ──Then→ Send SMS ──→ Goodbye
//                                └─Else→ One gentle nudge → Changed mind?
//                                          Then→ Send SMS / Else→ Goodbye
//
// Off-script replies ("who is this?", "is this a scam?", price questions…)
// are answered by the Playbook edge-case scenarios automatically — the flow
// keeps its place. Requires seed-promo-callback.mjs (promo_* scenarios).
//
// Idempotent: graph is rebuilt each run. Run: node scripts/seed-demo-basic.mjs
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const sb = createClient(
  "https://mfnebrospbqhbrxfexie.supabase.co",
  "sb_publishable_0CSebHk0k2ToTg7-F4KeDA_ZjRpz7q5"
);

const SCRIPT_NAME = "Demo — Basic Welcome Call";

const { data: handlers } = await sb.from("listener_handlers").select("id, intent_key");
const byIntent = Object.fromEntries((handlers ?? []).map((h) => [h.intent_key, h.id]));
const scn = (k) => {
  if (!byIntent[k]) {
    console.log(`Missing scenario "${k}" — run seed-promo-callback.mjs first.`);
    process.exit(1);
  }
  return byIntent[k];
};

let { data: script } = await sb.from("listener_scripts").select("id").eq("name", SCRIPT_NAME).maybeSingle();
let scriptId = script?.id;
if (!scriptId) {
  const { data, error } = await sb
    .from("listener_scripts")
    .insert({
      name: SCRIPT_NAME,
      description:
        "Presentation starter: offer → yes? → text the link → goodbye, with one gentle nudge. Off-script questions are answered by the Playbook automatically.",
    })
    .select()
    .single();
  if (error) {
    console.log("FAILED to create script:", error.message);
    process.exit(1);
  }
  scriptId = data.id;
}

const node = (label, type, config, scenario_id, pos_x, pos_y) => ({
  id: randomUUID(),
  script_id: scriptId,
  type,
  scenario_id: scenario_id ?? null,
  label,
  config,
  pos_x,
  pos_y,
});
const start = node("Start call", "start", { mode: "agent_first" }, null, 272, 16);
const offer = node(
  "Offer the welcome promo",
  "step",
  { contentType: "scenario", candidateScenarioIds: [scn("promo_busy"), scn("promo_not_interested")] },
  scn("promo_hook"),
  272,
  144
);
const saidYes = node("Said yes to the text?", "step", { contentType: "ifelse", condBy: "intent", condValue: "promo_sms_yes" }, null, 272, 304);
const sms = node("Text the claim link", "step", { contentType: "send_sms" }, scn("promo_sms_yes"), 80, 448);
const nudge = node(
  "One gentle nudge",
  "step",
  { contentType: "scenario", candidateScenarioIds: [scn("promo_busy"), scn("promo_price_question"), scn("promo_how_claim")] },
  scn("promo_not_interested"),
  464,
  448
);
const retry = node("Changed their mind?", "step", { contentType: "ifelse", condBy: "intent", condValue: "promo_sms_yes" }, null, 464, 592);
const end = node("Warm goodbye", "step", { contentType: "end" }, scn("promo_goodbye"), 272, 736);

const nodes = [start, offer, saidYes, sms, nudge, retry, end];
const edge = (s, t, handle = "out", label = "") => ({
  id: randomUUID(),
  script_id: scriptId,
  source_node_id: s.id,
  target_node_id: t.id,
  condition: { kind: "plain", handle },
  label,
});
const edges = [
  edge(start, offer),
  edge(offer, saidYes),
  edge(saidYes, sms, "then", "Then"),
  edge(saidYes, nudge, "else", "Else"),
  edge(sms, end),
  edge(nudge, retry),
  edge(retry, sms, "then", "Then"),
  edge(retry, end, "else", "Else"),
];

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

console.log(`Seeded "${SCRIPT_NAME}" — ${nodes.length} boxes, ${edges.length} arrows.`);
console.log("Present this one first; then open \"Sales Call — Phased (example)\" for the full version.");
