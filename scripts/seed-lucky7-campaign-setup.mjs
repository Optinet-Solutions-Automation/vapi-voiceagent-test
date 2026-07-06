// One-command lab setup for the LUCKY SEVEN campaign — the counterpart of
// seed-demo-campaign-setup.mjs (BrightPath). Until per-campaign config lands
// (Phase 3), switching campaigns = switching these three globals:
//
//   1. short_prompt   → Tom @ Lucky Seven, on the same hardened template
//                       (hard rules, silent tools, fillers) as the demo persona
//   2. collection     → "Lucky7even — Full Script" (scopes the router)
//   3. active script  → "Lucky Seven — Welcome Call" (built below from the
//                       lucky7 scenarios; modern shape with skip-ahead-ready
//                       consent If/Else)
//
// The script's Start box has NO opening line on purpose: test calls fall back
// to the global "first_message" scenario ("Hi {{name}}, this is Tom from
// Lucky Seven..."), which stays editable in the Playbook.
//
// Run: node scripts/seed-lucky7-campaign-setup.mjs
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const sb = createClient(
  "https://mfnebrospbqhbrxfexie.supabase.co",
  "sb_publishable_0CSebHk0k2ToTg7-F4KeDA_ZjRpz7q5"
);

// Persona = identity + delivery ONLY. The universal listener operating rules
// (engagement, STAFF/INSTRUCTION handling, hard rules) live in
// lib/lab-tools.ts LAB_OPERATING_RULES and are appended automatically by
// configure-assistant when the prompt is pushed.
const LUCKY7_PROMPT = `[Identity] You are Tom — a warm, natural-sounding voice agent for Lucky Seven Casino, calling newly registered customers about the account they created at Lucky7even.com. If asked who you're with, say Lucky Seven — never invent any other company name. Pronounce the brand "Lucky Seven" and read the website as "lucky seven even dot com".

[Delivery & personality] Calm, human, and easy to talk to. Never rushed or breathy; enunciate clearly and mind your pacing. Keep replies short — one or two sentences — and let the customer lead. Friendly, not pushy. Ignore background noise. Never invent details, prices, or terms.`;

// ── Identity lives in the Playbook (special "identity" scenario) ──
// Never routed; configure-assistant composes the system prompt from it.
await sb.from("listener_handlers").upsert(
  {
    name: "Identity (who the agent is)",
    intent_key: "identity",
    tags: ["Identity"],
    description:
      "SPECIAL: not routed — this is the campaign persona. configure-assistant composes the system prompt from this text + the universal operating rules.",
    response_template: LUCKY7_PROMPT,
    action_type: "ignore",
    delivery: "verbatim",
    priority: 0,
    mode: "both",
    enabled: true,
    updated_at: new Date().toISOString(),
  },
  { onConflict: "intent_key" }
);

// ── Scenario lookups (from seed-lucky7-handlers.mjs) ──────────
const { data: handlers } = await sb.from("listener_handlers").select("id, intent_key");
const byIntent = Object.fromEntries((handlers ?? []).map((h) => [h.intent_key, h.id]));
const scn = (k) => {
  if (!byIntent[k]) {
    console.log(`Missing scenario "${k}" — run seed-lucky7-handlers.mjs first.`);
    process.exit(1);
  }
  return byIntent[k];
};

// ── The script: modern shape over the lucky7 playbook ─────────
const SCRIPT_NAME = "Lucky Seven — Welcome Call";
let { data: script } = await sb.from("listener_scripts").select("id").eq("name", SCRIPT_NAME).maybeSingle();
let scriptId = script?.id;
if (!scriptId) {
  const { data, error } = await sb
    .from("listener_scripts")
    .insert({
      name: SCRIPT_NAME,
      description:
        "Lucky Seven welcome flow: free-spins offer → consent → SMS → goodbye, with one nudge. Opening comes from the global first_message scenario (Tom).",
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
  "Offer the free spins",
  "step",
  { contentType: "scenario", candidateScenarioIds: [scn("no_time"), scn("not_interested_soft")] },
  scn("main_offer"),
  272,
  144
);
const saidYes = node("Said yes to the text?", "step", { contentType: "ifelse", condBy: "intent", condValue: "sms_consent" }, null, 272, 304);
const sms = node("Text the details", "step", { contentType: "send_sms" }, scn("sms_consent"), 80, 448);
const nudge = node(
  "One gentle nudge",
  "step",
  { contentType: "scenario", candidateScenarioIds: [scn("no_time"), scn("cant_act_now")] },
  scn("not_interested_soft"),
  464,
  448
);
const retry = node("Changed their mind?", "step", { contentType: "ifelse", condBy: "intent", condValue: "sms_consent" }, null, 464, 592);
const end = node("Warm goodbye", "step", { contentType: "end" }, scn("goodbye"), 272, 736);

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

// ── Flip the lab to the Lucky Seven campaign ──────────────────
const { data: col } = await sb
  .from("listener_collections")
  .select("id, name")
  .eq("name", "Lucky7even — Full Script")
  .maybeSingle();
if (!col) {
  console.log('Collection "Lucky7even — Full Script" not found — run seed-lucky7-handlers.mjs first.');
  process.exit(1);
}
const { error } = await sb
  .from("lab_settings")
  .update({
    short_prompt: LUCKY7_PROMPT,
    active_collection_id: col.id,
    active_script_id: scriptId,
    injection_cooldown_ms: 1500,
    updated_at: new Date().toISOString(),
  })
  .eq("id", "default");
if (error) {
  console.log("FAILED:", error.message);
  process.exit(1);
}

console.log("Lab switched to the LUCKY SEVEN campaign:");
console.log(`  • persona prompt  → "Tom, Lucky Seven" (hardened template)`);
console.log(`  • collection      → ${col.name}`);
console.log(`  • active script   → ${SCRIPT_NAME}`);
console.log("");
console.log("Start Call auto-pushes this onto the assistant. The opening comes from the");
console.log('global "first_message" scenario (Tom / Lucky7even.com), editable in the Playbook.');
console.log("Switch back to the demo campaign anytime: node scripts/seed-demo-campaign-setup.mjs");
