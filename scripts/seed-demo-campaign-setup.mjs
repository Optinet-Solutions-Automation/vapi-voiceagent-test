// One-command lab setup for the welcome-promo demo. The lab currently has ONE
// global assistant persona / collection / active script (per-campaign config
// is the planned Phase 3), so switching campaigns means switching these three:
//
//   1. short_prompt   → the welcome-team persona ("Alex"), replacing Lucky7's
//   2. collection     → "Welcome Promo — Full Playbook" (scopes the router)
//   3. active script  → "Demo — Basic Welcome Call"
//
// After running: open Listener Lab → Configuration → Save Configuration once,
// so the new prompt is pushed onto the VAPI assistant. Then Start Call.
// (Re-run seed-lucky7-handlers.mjs to restore the Lucky7 prompt later.)
//
// Run: node scripts/seed-demo-campaign-setup.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "https://mfnebrospbqhbrxfexie.supabase.co",
  "sb_publishable_0CSebHk0k2ToTg7-F4KeDA_ZjRpz7q5"
);

// Persona = identity + delivery ONLY. The universal listener operating rules
// (engagement, STAFF/INSTRUCTION handling, hard rules) live in
// lib/lab-tools.ts LAB_OPERATING_RULES and are appended automatically by
// configure-assistant when the prompt is pushed.
const WELCOME_PROMPT = `[Identity] You are Alex — a warm, natural-sounding voice agent for the customer team at BrightPath (replace the company name per campaign), calling clients who created an account this week to welcome them and share the welcome promo waiting on their account. If asked who you're with, say BrightPath — never invent any other company name.

[Delivery & personality] Calm, human, and easy to talk to. Never rushed or breathy; enunciate clearly and mind your pacing. Keep replies short — one or two sentences — and let the customer lead. Friendly, not pushy. Ignore background noise. Never invent details, prices, or terms.`;

// Identity lives in the Playbook (special "identity" scenario, never routed);
// configure-assistant composes the system prompt from it + operating rules.
await sb.from("listener_handlers").upsert(
  {
    name: "Identity (who the agent is)",
    intent_key: "identity",
    tags: ["Identity"],
    description:
      "SPECIAL: not routed — this is the campaign persona. configure-assistant composes the system prompt from this text + the universal operating rules.",
    response_template: WELCOME_PROMPT,
    action_type: "ignore",
    delivery: "verbatim",
    priority: 0,
    mode: "both",
    enabled: true,
    updated_at: new Date().toISOString(),
  },
  { onConflict: "intent_key" }
);

const { data: col, error: ce } = await sb
  .from("listener_collections")
  .select("id, name")
  .eq("name", "Welcome Promo — Full Playbook")
  .maybeSingle();
if (ce || !col) {
  console.log("Collection not found — run seed-edge-cases.mjs first.");
  process.exit(1);
}
const { data: script } = await sb
  .from("listener_scripts")
  .select("id, name")
  .eq("name", "Demo — Basic Welcome Call")
  .maybeSingle();
if (!script) {
  console.log("Script not found — run seed-demo-basic.mjs first.");
  process.exit(1);
}

const { error } = await sb
  .from("lab_settings")
  .update({
    short_prompt: WELCOME_PROMPT,
    active_collection_id: col.id,
    active_script_id: script.id,
    updated_at: new Date().toISOString(),
  })
  .eq("id", "default");
if (error) {
  console.log("FAILED:", error.message);
  process.exit(1);
}

console.log("Lab switched to the Welcome Promo campaign:");
console.log(`  • persona prompt  → "Alex, customer team" (saved to lab settings)`);
console.log(`  • collection      → ${col.name}`);
console.log(`  • active script   → ${script.name}`);
console.log("");
console.log("Start Call now auto-pushes this configuration onto the VAPI assistant —");
console.log("no manual Save Configuration needed. Just pick a script and dial.");
