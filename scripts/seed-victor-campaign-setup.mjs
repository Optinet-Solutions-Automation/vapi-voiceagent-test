// One-command lab setup for the VICTOR @ LUCKY SEVEN campaign — the v2
// production spec decomposed into data:
//
//   identity        → Victor persona (Playbook "identity" scenario)
//   first_message   → Victor's opening question (logged-in-recently hook)
//   v7_* scenarios  → campaign lines: ack bridge, spins reveal (Victor added
//                     them personally), expiry + 300% deposit bonus, SMS
//                     announce, no-SMS wrap, not-interested (send anyway),
//                     wrong number, no-longer-plays, website spelling, goodbye
//   collection      → "Lucky Seven — Victor (v2)": v7_* + lucky7 Q&A and
//                     compliance + neutral edge cases (incl. the platform
//                     rules: edge_no_sms, edge_machine_detected)
//   script          → "Lucky Seven — Victor Call": Start → Stage 1 (opening
//                     replies) → Reveal the spins → Stage 2 (reactions & Q&A,
//                     default = expiry + bonus) → Objects to texts?
//                     Then → wrap without SMS / Else → SMS announce → goodbye
//
// Platform rules honored by structure: SMS dispatch is verbally confirmed by
// the SMS box line; a texts objection is accepted the FIRST time (edge_no_sms
// branch, no send); the call never ends right on consent (SMS box → End box);
// opt-out and voicemail/machine are reactive end_call scenarios that work
// from anywhere (machine = hang up without speaking).
//
// Run: node scripts/seed-victor-campaign-setup.mjs
// (Requires seed-lucky7-handlers.mjs and seed-edge-cases.mjs to have run.)
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const sb = createClient(
  "https://mfnebrospbqhbrxfexie.supabase.co",
  "sb_publishable_0CSebHk0k2ToTg7-F4KeDA_ZjRpz7q5"
);

// ── Persona (identity + delivery + campaign rules; operating rules are
//    appended automatically by configure-assistant) ──────────────────────
const VICTOR_PROMPT = `[Identity] You are Victor — an account manager at Lucky Seven Casino, personally calling customers about their account. If asked who you're with, say Lucky Seven — never invent any other company name. Pronounce the website "Lucky Seven dot com"; say "SMS" naturally as a word, never letter by letter.

[Delivery & personality] Warm, natural, conversational, lightly enthusiastic — suggestive, never pushy. Keep replies short and ask at most ONE question per turn. Never invent information; stick to their Lucky Seven account and gameplay only.

[Campaign rules] Mention the free spins at most twice in the whole call, and the deposit bonus at most twice. If the customer declines texts, accept it the FIRST time — acknowledge politely, never pressure, never send. Always confirm verbally when an SMS goes out ("I'm sending it over SMS now"). Never end the call abruptly right after they agree to a text — confirm the send first, then wrap up politely.`;

const FIRST_MESSAGE =
  "Hey {{name}}, Victor here from Lucky Seven dot com — quick question: have you had a chance to log into your account recently?";

// ── Campaign scenarios ────────────────────────────────────────
const scenarios = [
  {
    name: "Victor — acknowledge & hook",
    intent_key: "v7_ack_bridge",
    tags: ["Victor v2", "Greeting"],
    // Reply-shaped wording here once let the router match every "what about
    // it?" to the bridge, deferring forever — the spins were never revealed.
    description:
      "SPEAK-ONLY bridge — spoken by the script after the opening reply. Not a customer reply; never match replies to it.",
    response_template:
      "Acknowledge their answer briefly and warmly in a few words, then mention you were actually just looking over their account right before calling.",
    action_type: "answer",
    delivery: "reword",
    priority: 10,
    mode: "both",
  },
  {
    name: "Victor — reveal the free spins",
    intent_key: "v7_spins_reveal",
    tags: ["Victor v2", "Promotions"],
    description:
      "SPEAK-ONLY: the free-spins reveal, delivered by the script at its step. Not a customer reply; never match replies to it.",
    response_template:
      "Reveal it personally: you were going over their account and YOU added twenty free spins for them — you just wanted to make sure they knew the spins are there. Casual, like a favor, not a pitch. (Free spins: at most two mentions in the whole call.)",
    action_type: "give_offer",
    delivery: "reword",
    priority: 11,
    mode: "both",
  },
  {
    name: "Victor — expiry + deposit bonus",
    intent_key: "v7_expiry_bonus",
    tags: ["Victor v2", "Promotions"],
    description:
      "SPEAK-ONLY: the reason for the call — spins expiry plus the deposit bonus, delivered by the script at its step. Not a customer reply; never match replies to it.",
    response_template:
      "Tell them the spins do have an expiry on them — that's actually why you're calling. Then add that on top of that, they can claim a three hundred percent bonus on their next deposit. (Each offer: at most two mentions per call.)",
    action_type: "give_offer",
    delivery: "reword",
    priority: 12,
    mode: "both",
  },
  {
    name: "Victor — SMS announce & send",
    intent_key: "v7_sms_announce",
    tags: ["Victor v2", "SMS"],
    description: "The dispatch confirmation spoken as the SMS goes out.",
    response_template:
      "I'm sending all of it over SMS right now — the free spins and the deposit bonus details, so you have everything in one place.",
    action_type: "send_sms",
    delivery: "verbatim",
    priority: 13,
    mode: "both",
  },
  {
    name: "Victor — wrap without SMS",
    intent_key: "v7_no_sms_wrap",
    tags: ["Victor v2", "Compliance"],
    description: "Wrap-up after the customer declined texts — accepted the first time, no send.",
    response_template:
      "No text will be sent — they declined and that's final, zero pressure. Acknowledge warmly, mention the spins and bonus are visible right in their account when they log in, and wrap up politely.",
    action_type: "answer",
    delivery: "reword",
    priority: 14,
    mode: "both",
  },
  {
    name: "Victor — not interested (send anyway)",
    intent_key: "v7_not_interested",
    tags: ["Victor v2", "Objections"],
    description:
      "Customer is uninterested in the offer or brushes it off — but did NOT object to being texted.",
    response_template:
      'Accept it gracefully in this spirit: "Fair enough — I\'ll send everything over to you via SMS just in case you change your mind and decide to take advantage of it later." Do not argue or push.',
    action_type: "answer",
    delivery: "reword",
    priority: 15,
    mode: "both",
  },
  {
    name: "Victor — wrong number",
    intent_key: "v7_wrong_number",
    tags: ["Victor v2", "Closing"],
    description: "Someone else answered, the person is unavailable, or it's a wrong number.",
    response_template: "I'm sorry, I must have the wrong number. Thanks for your time. Have a great day.",
    action_type: "end_call",
    delivery: "verbatim",
    priority: 4,
    mode: "both",
  },
  {
    name: "Victor — no longer plays",
    intent_key: "v7_no_longer_plays",
    tags: ["Victor v2", "Closing"],
    description:
      "Customer says they no longer play, stopped using the account, or aren't into it anymore — casual, not a gambling-problem plea (that has its own handler).",
    response_template: "Thanks for your time. Have a great day.",
    action_type: "end_call",
    delivery: "verbatim",
    priority: 5,
    mode: "both",
  },
  {
    name: "Victor — how to claim the spins",
    intent_key: "v7_how_claim",
    tags: ["Victor v2", "Q&A"],
    description:
      "Customer asks how to claim, activate, use, or get the free spins or the bonus — how do I claim this, what do I do, do I just log in.",
    response_template:
      "It's simple: just log in at Lucky Seven dot com — the twenty free spins are already sitting in your balance, ready to activate, and the deposit bonus shows when you make your next deposit.",
    action_type: "answer",
    delivery: "reword",
    priority: 19,
    mode: "both",
  },
  {
    name: "Victor — website / spell it out",
    intent_key: "v7_website",
    tags: ["Victor v2", "Q&A"],
    description: "Customer asks for the website, the link, or asks you to spell it out.",
    response_template:
      "It's Lucky Seven dot com — spelled L-U-C-K-Y, then the number 7, then E-V-E-N, dot com.",
    action_type: "answer",
    delivery: "verbatim",
    priority: 20,
    mode: "both",
  },
  {
    name: "Victor — goodbye",
    intent_key: "v7_goodbye",
    tags: ["Victor v2", "Closing"],
    description: "Conversation concluded — customer says goodbye, thanks, or is all set.",
    response_template: "Thanks so much for your time — enjoy the spins, and have a great day!",
    action_type: "end_call",
    delivery: "verbatim",
    priority: 30,
    mode: "both",
  },
];

const { data: existing } = await sb.from("listener_handlers").select("id, intent_key");
const byIntent = Object.fromEntries((existing ?? []).map((r) => [r.intent_key, r.id]));
let added = 0;
for (const s of scenarios) {
  if (byIntent[s.intent_key]) {
    // Campaign lines are authoritative from this seed — refresh on rerun.
    await sb
      .from("listener_handlers")
      .update({
        description: s.description,
        response_template: s.response_template,
        delivery: s.delivery,
        action_type: s.action_type,
        updated_at: new Date().toISOString(),
      })
      .eq("intent_key", s.intent_key);
    continue;
  }
  const { data, error } = await sb.from("listener_handlers").insert(s).select("id").single();
  if (error) {
    console.log("FAILED scenario", s.intent_key, error.message);
    process.exit(1);
  }
  byIntent[s.intent_key] = data.id;
  added++;
}
const scn = (k) => {
  if (!byIntent[k]) {
    console.log(`Missing scenario "${k}" — run seed-lucky7-handlers.mjs and seed-edge-cases.mjs first.`);
    process.exit(1);
  }
  return byIntent[k];
};

// ── Identity + opening (special Playbook slots, swapped per campaign) ──
await sb.from("listener_handlers").upsert(
  {
    name: "Identity (who the agent is)",
    intent_key: "identity",
    tags: ["Identity"],
    description:
      "SPECIAL: not routed — this is the campaign persona. configure-assistant composes the system prompt from this text + the universal operating rules.",
    response_template: VICTOR_PROMPT,
    action_type: "ignore",
    delivery: "verbatim",
    priority: 0,
    mode: "both",
    enabled: true,
    updated_at: new Date().toISOString(),
  },
  { onConflict: "intent_key" }
);
await sb.from("listener_handlers").upsert(
  {
    name: "First Message (call opening)",
    intent_key: "first_message",
    tags: ["Greeting"],
    description:
      "SPECIAL: not routed — spoken as the agent's opening line when the call starts. Use {{name}} for the client's name.",
    response_template: FIRST_MESSAGE,
    action_type: "answer",
    delivery: "verbatim",
    priority: 0,
    mode: "both",
    enabled: true,
    updated_at: new Date().toISOString(),
  },
  { onConflict: "intent_key" }
);

// ── Collection: Victor's routing vocabulary ───────────────────
const COLLECTION = "Lucky Seven — Victor (v2)";
const MEMBER_KEYS = [
  // campaign lines
  ...scenarios.map((s) => s.intent_key),
  // lucky7 Q&A + compliance (reused; brand lines Victor replaces are excluded)
  "gambling_problem",
  "do_not_call",
  "upsell_offer",
  "wagering_requirements",
  "minimum_deposit",
  "where_find_spins",
  "which_game",
  "claim_limit",
  "how_got_number",
  "login_help",
  "deposit_in_progress",
  "no_time",
  "cant_act_now",
  "sms_consent",
  // platform + neutral edge cases
  "edge_machine_detected",
  "edge_no_sms",
  "edge_who_is_this",
  "edge_is_this_scam",
  "edge_are_you_ai",
  "edge_repeat_that",
  "edge_unclear_reply",
  "edge_want_email",
];
let { data: col } = await sb.from("listener_collections").select("id").eq("name", COLLECTION).maybeSingle();
if (!col) {
  const { data, error } = await sb
    .from("listener_collections")
    .insert({ name: COLLECTION, description: "Victor v2 campaign vocabulary: campaign lines, lucky7 Q&A/compliance, platform + neutral edge cases." })
    .select()
    .single();
  if (error) {
    console.log("FAILED collection:", error.message);
    process.exit(1);
  }
  col = data;
}
await sb.from("listener_collection_handlers").delete().eq("collection_id", col.id);
const memberRows = MEMBER_KEYS.filter((k) => byIntent[k]).map((k) => ({ collection_id: col.id, handler_id: byIntent[k] }));
const mi = await sb.from("listener_collection_handlers").insert(memberRows);
if (mi.error) {
  console.log("FAILED members:", mi.error.message);
  process.exit(1);
}

// ── Stage collections for the script ──────────────────────────
async function buildStage(name, description, keys) {
  let { data: c } = await sb.from("listener_collections").select("id").eq("name", name).maybeSingle();
  if (!c) {
    const { data, error } = await sb.from("listener_collections").insert({ name, description }).select().single();
    if (error) {
      console.log(`FAILED stage "${name}":`, error.message);
      process.exit(1);
    }
    c = data;
  }
  await sb.from("listener_collection_handlers").delete().eq("collection_id", c.id);
  const rows = keys.filter((k) => byIntent[k]).map((k) => ({ collection_id: c.id, handler_id: byIntent[k] }));
  const r = await sb.from("listener_collection_handlers").insert(rows);
  if (r.error) {
    console.log(`FAILED stage members "${name}":`, r.error.message);
    process.exit(1);
  }
  return c.id;
}

const stage1Id = await buildStage(
  "Stage — Victor opening replies",
  "Replies to Victor's opening. Exits (wrong number, no-longer-plays, machine, DNC) stay reactive on purpose.",
  ["v7_ack_bridge", "edge_who_is_this", "how_got_number", "edge_is_this_scam", "edge_are_you_ai", "edge_repeat_that", "edge_unclear_reply", "no_time"]
);
const stage2Id = await buildStage(
  "Stage — Victor reactions & questions",
  "Reactions to the spins reveal and Q&A; default = the expiry + deposit bonus (the reason for the call).",
  [
    "v7_expiry_bonus",
    "v7_not_interested",
    "v7_how_claim",
    "v7_website",
    "upsell_offer",
    "wagering_requirements",
    "minimum_deposit",
    "where_find_spins",
    "which_game",
    "claim_limit",
    "cant_act_now",
    "no_time",
    "edge_repeat_that",
    "edge_unclear_reply",
    "edge_whats_the_catch",
  ]
);

// ── The script ────────────────────────────────────────────────
const SCRIPT_NAME = "Lucky Seven — Victor Call";
let { data: script } = await sb.from("listener_scripts").select("id").eq("name", SCRIPT_NAME).maybeSingle();
let scriptId = script?.id;
if (!scriptId) {
  const { data, error } = await sb
    .from("listener_scripts")
    .insert({
      name: SCRIPT_NAME,
      description:
        "Victor v2: opening question → spins reveal (personal favor) → expiry + 300% bonus → SMS announced and sent (unless they object to texts) → goodbye. Machine/DNC/wrong-number end reactively from anywhere.",
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
const start = node("Start call", "start", { mode: "agent_first" }, null, 272, 16); // opening from first_message (Victor)
const stage1 = node("Stage 1 — Opening replies", "step", { contentType: "collection", collectionId: stage1Id }, scn("v7_ack_bridge"), 272, 144);
const reveal = node("Reveal the free spins", "step", { contentType: "scenario" }, scn("v7_spins_reveal"), 272, 288);
const stage2 = node("Stage 2 — Reactions & questions", "step", { contentType: "collection", collectionId: stage2Id }, scn("v7_expiry_bonus"), 272, 432);
// Consent is checked FIRST — "just send me the SMS" must jump straight to the
// send (chain skip-ahead sees both if/elses); only then the objection check.
const saidYes = node("Asked for the text?", "step", { contentType: "ifelse", condBy: "intent", condValue: "sms_consent" }, null, 272, 576);
const noSms = node("Objects to texts?", "step", { contentType: "ifelse", condBy: "intent", condValue: "edge_no_sms" }, null, 464, 664);
const wrap = node("Wrap without SMS", "step", { contentType: "scenario" }, scn("v7_no_sms_wrap"), 656, 780);
const sms = node("Announce & send the SMS", "step", { contentType: "send_sms" }, scn("v7_sms_announce"), 160, 780);
const end = node("Goodbye", "step", { contentType: "end" }, scn("v7_goodbye"), 272, 920);

const nodes = [start, stage1, reveal, stage2, saidYes, noSms, wrap, sms, end];
const edge = (s, t, handle = "out", label = "") => ({
  id: randomUUID(),
  script_id: scriptId,
  source_node_id: s.id,
  target_node_id: t.id,
  condition: { kind: "plain", handle },
  label,
});
const edges = [
  edge(start, stage1),
  edge(stage1, reveal),
  edge(reveal, stage2),
  edge(stage2, saidYes),
  edge(saidYes, sms, "then", "Then"),
  edge(saidYes, noSms, "else", "Else"),
  edge(noSms, wrap, "then", "Then"),
  edge(noSms, sms, "else", "Else"),
  edge(wrap, end),
  edge(sms, end),
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

// ── Activate the campaign ─────────────────────────────────────
const { error } = await sb
  .from("lab_settings")
  .update({
    short_prompt: VICTOR_PROMPT,
    active_collection_id: col.id,
    active_script_id: scriptId,
    // The speaking lock sequences injections now — the old 4s cooldown just
    // starved legitimate answers (it once blocked the misheard-reply confirm).
    injection_cooldown_ms: 1500,
    updated_at: new Date().toISOString(),
  })
  .eq("id", "default");
if (error) {
  console.log("FAILED settings:", error.message);
  process.exit(1);
}

console.log(`Scenarios added: ${added} (existing refreshed).`);
console.log("Lab switched to the VICTOR @ LUCKY SEVEN campaign:");
console.log(`  • persona/opening → Victor, "Lucky Seven dot com" (identity + first_message in the Playbook)`);
console.log(`  • collection      → ${COLLECTION} (${memberRows.length} scenarios)`);
console.log(`  • active script   → ${SCRIPT_NAME}`);
console.log("");
console.log("Start Call auto-pushes everything. Platform rules live: machine → silent");
console.log("hang-up; 'don't text me' → accepted first time, no send; SMS always");
console.log("verbally confirmed; call never ends right on consent.");
console.log("Switch campaigns: seed-lucky7-campaign-setup.mjs / seed-demo-campaign-setup.mjs");
