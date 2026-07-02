// Seeds a complete example voice agent for one campaign:
// "Welcome Promo — New Signups" — calls a client who registered this week
// and offers them a welcome promo, with SMS follow-up and objection handling.
//
// Creates: 7 scenarios (idempotent by intent_key) + the script graph
// (rebuilt each run, like seed-sample-script.mjs).
// The flow spine lives in the script; Q&A scenarios (price, how to claim)
// ride the reactive listener layer so questions can be answered off-script.
//
// Run: node scripts/seed-promo-callback.mjs
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const sb = createClient(
  "https://mfnebrospbqhbrxfexie.supabase.co",
  "sb_publishable_0CSebHk0k2ToTg7-F4KeDA_ZjRpz7q5"
);

const SCRIPT_NAME = "Welcome Promo — New Signups";

// ── 1. Scenarios ──────────────────────────────────────────────
const scenarios = [
  {
    name: "Welcome Promo — the offer",
    intent_key: "promo_hook",
    tags: ["Welcome Promo", "Promotions"],
    description:
      "Customer responds to the opening — confirms it's them, asks what the call is about, or sounds neutral/curious.",
    response_template:
      "Great — I'll keep it quick. Since you registered with us this week, there's a welcome promo on your account: twenty-five percent off your first month, already applied. Want me to text you the link so you can claim it whenever suits you?",
    action_type: "give_offer",
    delivery: "verbatim",
    priority: 10,
    mode: "both",
  },
  {
    name: "Welcome Promo — yes, text me",
    intent_key: "promo_sms_yes",
    tags: ["Welcome Promo", "SMS"],
    description:
      "Customer agrees to receive the link by text/SMS — says yes, sure, text me, send it over, sounds good.",
    response_template:
      "Perfect — I'm sending it to this number right now. The discount's already on your account, so the link takes you straight to it.",
    action_type: "send_sms",
    delivery: "verbatim",
    priority: 11,
    mode: "both",
  },
  {
    name: "Welcome Promo — busy right now",
    intent_key: "promo_busy",
    tags: ["Welcome Promo", "Objections"],
    description:
      "Customer says they're busy, driving, at work, in a meeting, or can't talk right now.",
    response_template:
      "Respect their time immediately. Offer to text the promo link so they can claim it later, then wrap up quickly and politely.",
    action_type: "answer",
    delivery: "reword",
    priority: 12,
    mode: "both",
  },
  {
    name: "Welcome Promo — hesitant / not interested",
    intent_key: "promo_not_interested",
    tags: ["Welcome Promo", "Objections"],
    description:
      "Customer politely declines or hesitates — not right now, maybe later, not sure — but isn't angry and hasn't asked to never be called.",
    response_template:
      "Acknowledge kindly, no pressure. Mention once that the welcome discount stays on their account for seven days, and offer to text the link so they can decide in their own time. If they still decline, thank them warmly and wrap up.",
    action_type: "answer",
    delivery: "reword",
    priority: 13,
    mode: "both",
  },
  // Q&A — not wired into the flow; the reactive listener answers these when asked.
  {
    name: "Welcome Promo — price question",
    intent_key: "promo_price_question",
    tags: ["Welcome Promo", "Q&A"],
    description:
      "Customer asks what it costs, the price after the discount, or what they'd be paying.",
    response_template:
      "With the welcome discount it's thirty-six dollars for your first month instead of forty-nine, and you can cancel anytime.",
    action_type: "answer",
    delivery: "verbatim",
    priority: 20,
    mode: "both",
  },
  {
    name: "Welcome Promo — how do I claim it",
    intent_key: "promo_how_claim",
    tags: ["Welcome Promo", "Q&A"],
    description: "Customer asks how to claim the promo or where to find it.",
    response_template:
      "Just log into your account — the discount is already applied at checkout. Or I can text you a direct link, whichever's easier.",
    action_type: "answer",
    delivery: "verbatim",
    priority: 21,
    mode: "both",
  },
  {
    name: "Welcome Promo — wrap up",
    intent_key: "promo_goodbye",
    tags: ["Welcome Promo", "Closing"],
    description:
      "The conversation is done — customer says thanks, goodbye, all set, or the flow reaches its end.",
    response_template:
      "You're all set — thanks for joining us this week, and enjoy the promo. Have a great day!",
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
  if (byIntent[s.intent_key]) continue;
  const { data, error } = await sb.from("listener_handlers").insert(s).select("id").single();
  if (error) {
    console.log("FAILED scenario", s.intent_key, error.message);
    process.exit(1);
  }
  byIntent[s.intent_key] = data.id;
  added++;
}
const scn = (k) => byIntent[k] ?? null;

// ── 2. Script ─────────────────────────────────────────────────
let { data: script } = await sb
  .from("listener_scripts")
  .select("id")
  .eq("name", SCRIPT_NAME)
  .maybeSingle();
let scriptId = script?.id;
if (!scriptId) {
  const { data, error } = await sb
    .from("listener_scripts")
    .insert({
      name: SCRIPT_NAME,
      description: "Example: call a client who registered this week and offer the welcome promo.",
    })
    .select()
    .single();
  if (error) {
    console.log("FAILED to create script:", error.message);
    process.exit(1);
  }
  scriptId = data.id;
}

// ── 3. Graph ──────────────────────────────────────────────────
// Start → Offer → agreed-to-text? → (Send link | Gentle nudge → changed mind?) → Wrap up
const nStart = randomUUID();
const nOffer = randomUUID();
const nAgreed = randomUUID();
const nSms = randomUUID();
const nNudge = randomUUID();
const nRetry = randomUUID();
const nEnd = randomUUID();

const nodes = [
  {
    id: nStart, script_id: scriptId, type: "start", scenario_id: null,
    label: "Start call", config: { mode: "agent_first" }, pos_x: 272, pos_y: 16,
  },
  {
    id: nOffer, script_id: scriptId, type: "step", scenario_id: scn("promo_hook"),
    label: "Offer the welcome promo",
    // Candidates: if their first reply is already a brush-off, the router
    // speaks the matching objection line instead of the offer.
    config: { contentType: "scenario", candidateScenarioIds: [scn("promo_busy"), scn("promo_not_interested")].filter(Boolean) },
    pos_x: 272, pos_y: 144,
  },
  {
    id: nAgreed, script_id: scriptId, type: "step", scenario_id: null,
    label: "Agreed to the text?",
    // Branches on the customer's classified reply (runtime supports intent here).
    config: { contentType: "ifelse", condBy: "intent", condValue: "promo_sms_yes" },
    pos_x: 272, pos_y: 288,
  },
  {
    id: nSms, script_id: scriptId, type: "step", scenario_id: scn("promo_sms_yes"),
    label: "Send the link", config: { contentType: "scenario" }, pos_x: 80, pos_y: 432,
  },
  {
    id: nNudge, script_id: scriptId, type: "step", scenario_id: scn("promo_not_interested"),
    label: "One gentle nudge",
    // Also fields price / how-to questions and "I'm busy" at this step.
    config: {
      contentType: "scenario",
      candidateScenarioIds: [scn("promo_busy"), scn("promo_price_question"), scn("promo_how_claim")].filter(Boolean),
    },
    pos_x: 464, pos_y: 432,
  },
  {
    id: nRetry, script_id: scriptId, type: "step", scenario_id: null,
    label: "Changed their mind?",
    config: { contentType: "ifelse", condBy: "intent", condValue: "promo_sms_yes" },
    pos_x: 464, pos_y: 576,
  },
  {
    id: nEnd, script_id: scriptId, type: "step", scenario_id: scn("promo_goodbye"),
    label: "Wrap up", config: { contentType: "end" }, pos_x: 272, pos_y: 720,
  },
];

const edge = (source, target, handle, label = "") => ({
  id: randomUUID(),
  script_id: scriptId,
  source_node_id: source,
  target_node_id: target,
  condition: { kind: "plain", handle },
  label,
});

const edges = [
  edge(nStart, nOffer, "out"),
  edge(nOffer, nAgreed, "out"),
  edge(nAgreed, nSms, "then", "Then"),
  edge(nAgreed, nNudge, "else", "Else"),
  edge(nSms, nEnd, "out"),
  edge(nNudge, nRetry, "out"),
  edge(nRetry, nSms, "then", "Then"),
  edge(nRetry, nEnd, "else", "Else"),
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

console.log(`Scenarios added: ${added} (existing kept).`);
console.log(`Seeded "${SCRIPT_NAME}" — ${nodes.length} boxes, ${edges.length} arrows.`);
console.log(`Open it in the Script Builder. Note: the opening line still comes from the`);
console.log(`global "first_message" scenario — per-campaign openings are a planned change.`);
