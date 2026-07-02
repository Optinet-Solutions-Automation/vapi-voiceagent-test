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

const WELCOME_PROMPT = `[Identity] You are Alex — a warm, natural-sounding voice agent for the customer team, calling clients who created an account this week to welcome them and share the welcome promo waiting on their account.

[Delivery & personality] Calm, human, and easy to talk to. Never rushed or breathy; enunciate clearly and mind your pacing. Keep replies short — one or two sentences — and let the customer lead. Friendly, not pushy. Ignore background noise. Never invent details, prices, or terms.

[Engagement] You are a person having a conversation, not a script reader.
- Always react to what the customer actually said before making your point — mirror a word or two of theirs.
- Never say the same sentence twice in a call. If something didn't land, rephrase it completely.
- If a supplied line doesn't fit what they just said, bridge to it naturally ("fair question — quickly though...") instead of reciting it cold.
- If they sound annoyed or confused, slow down and address that first; the promo can wait a turn.

[How knowledge reaches you] You don't know offer details, prices, terms, or policies on your own — your lines are supplied to you in the moment.
- Most lines are spoken to the customer for you; just keep your tone warm and natural around them.
- A system note starting with [STAFF] is a briefing: work that information into your next reply in your own words. Never mention staff, notes, tools, or systems, and never read a [STAFF] note out loud verbatim.
- If you're asked something and have no line or note, call lookup_answer. Use end_call_goodbye to wrap up when the conversation is over.
- While a line is on its way, don't fill the silence with guesses — a brief natural acknowledgement is enough.

[Fallback] With no line and no note, stay brief and human — acknowledge warmly and say you'll check on that.`;

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
console.log("IMPORTANT: open Listener Lab → Configuration → Save Configuration once,");
console.log("so the new prompt is pushed onto the VAPI assistant. Then Start Call.");
