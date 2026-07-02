// Seeds the stage-collection pattern: instead of nesting an If/Else per
// possible reply, each "expect a reply" moment is ONE Collection box — the
// router speaks whichever member scenario fits the customer's reply, and the
// box's default line covers everything else. One If/Else carries the only
// decision that actually branches the call (consent), with a capped loop
// keeping the stage alive until it fires.
//
//   Start (opening)
//   → [Stage 1 — Opening replies]        who is this / my number / scam /
//                                        robot / busy / repeat … default: bridge
//   → [Give the pitch]
//   → [Said yes to the text?] ──Then→ [Send SMS] → [Warm goodbye]
//        └─Else→ [Stage 2 — Handle & steer back]   price / how / catch /
//                                        never signed up / not interested …
//                                        default: redirect-to-purpose
//              → [Loop ×3] repeat → back to the consent check
//                          exit  → [Declined goodbye]
//
// Exits that should END the call (wrong number, do-not-call, goodbye) are
// deliberately NOT stage members: they fall through to the reactive Playbook,
// whose end_call scenarios hang up from anywhere.
//
// Idempotent: collections' membership and the script graph are rebuilt each
// run. Requires seed-promo-callback / seed-phased-workflows / seed-edge-cases.
// Run: node scripts/seed-stage-collections.mjs
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const sb = createClient(
  "https://mfnebrospbqhbrxfexie.supabase.co",
  "sb_publishable_0CSebHk0k2ToTg7-F4KeDA_ZjRpz7q5"
);

const SCRIPT_NAME = "Welcome Call — Stage Collections (example)";

const { data: handlers } = await sb.from("listener_handlers").select("id, intent_key");
const byIntent = Object.fromEntries((handlers ?? []).map((h) => [h.intent_key, h.id]));
const scn = (k) => {
  if (!byIntent[k]) {
    console.log(`Missing scenario "${k}" — run the promo/phased/edge-case seeds first.`);
    process.exit(1);
  }
  return byIntent[k];
};

// ── 1. Stage collections (membership rebuilt each run) ────────
async function buildCollection(name, description, intentKeys) {
  let { data: col } = await sb.from("listener_collections").select("id").eq("name", name).maybeSingle();
  if (!col) {
    const { data, error } = await sb
      .from("listener_collections")
      .insert({ name, description })
      .select()
      .single();
    if (error) {
      console.log(`FAILED collection "${name}":`, error.message);
      process.exit(1);
    }
    col = data;
  }
  await sb.from("listener_collection_handlers").delete().eq("collection_id", col.id);
  const rows = intentKeys.map((k) => ({ collection_id: col.id, handler_id: scn(k) }));
  const { error } = await sb.from("listener_collection_handlers").insert(rows);
  if (error) {
    console.log(`FAILED members for "${name}":`, error.message);
    process.exit(1);
  }
  return col.id;
}

const stage1Id = await buildCollection(
  "Stage — Opening replies (Welcome)",
  "Everything a customer says right after the opening that should keep the call going. Wrong-number / do-not-call exits are reactive end_call scenarios on purpose — not members.",
  [
    "open_right_person", // default via the box's Default line
    "edge_who_is_this",
    "edge_how_got_number",
    "edge_is_this_scam",
    "edge_are_you_ai",
    "edge_repeat_that",
    "promo_busy",
  ]
);

const stage2Id = await buildCollection(
  "Stage — Handle & steer back (Welcome)",
  "Post-pitch replies: questions and objections get their member's answer; anything vague gets the redirect-to-purpose default. Consent exits via the script's If/Else.",
  [
    "pitch_redirect", // default via the box's Default line
    "promo_price_question",
    "promo_how_claim",
    "edge_whats_the_catch",
    "edge_never_signed_up",
    "edge_already_claimed",
    "promo_not_interested",
    "promo_busy",
    "edge_repeat_that",
    "edge_is_this_scam",
    "edge_how_got_number",
    "edge_want_email",
  ]
);

// ── 2. The script ─────────────────────────────────────────────
let { data: script } = await sb.from("listener_scripts").select("id").eq("name", SCRIPT_NAME).maybeSingle();
let scriptId = script?.id;
if (!scriptId) {
  const { data, error } = await sb
    .from("listener_scripts")
    .insert({
      name: SCRIPT_NAME,
      description:
        "Stage-driven: each expected-reply moment is one Collection box — the reply picks the member to speak, the default line covers the rest. A single If/Else (consent) branches the whole call.",
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

const start = node(
  "Start call",
  "start",
  {
    mode: "agent_first",
    opening:
      "Hi {{name}}! This is Alex from the customer team. You signed up with us earlier this week, so I'm just giving you a quick welcome call — have I caught you at an okay moment?",
  },
  null,
  272,
  16
);
const stage1 = node(
  "Stage 1 — Opening replies",
  "step",
  { contentType: "collection", collectionId: stage1Id },
  scn("open_right_person"),
  272,
  144
);
const pitch = node("Give the pitch", "step", { contentType: "scenario" }, scn("pitch_offer"), 272, 288);
const saidYes = node("Said yes to the text?", "step", { contentType: "ifelse", condBy: "intent", condValue: "promo_sms_yes" }, null, 272, 432);
const sms = node("Text the claim link", "step", { contentType: "send_sms" }, scn("promo_sms_yes"), 64, 576);
const stage2 = node(
  "Stage 2 — Handle & steer back",
  "step",
  { contentType: "collection", collectionId: stage2Id },
  scn("pitch_redirect"),
  480,
  576
);
const tries = node("Up to 3 rounds", "step", { contentType: "loop", maxLoops: 3 }, null, 480, 720);
const endOk = node("Warm goodbye", "step", { contentType: "end" }, scn("promo_goodbye"), 64, 720);
const endNo = node("Declined goodbye", "step", { contentType: "end" }, scn("pitch_declined_goodbye"), 272, 864);

const nodes = [start, stage1, pitch, saidYes, sms, stage2, tries, endOk, endNo];
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
  edge(stage1, pitch),
  edge(pitch, saidYes),
  edge(saidYes, sms, "then", "Then"),
  edge(saidYes, stage2, "else", "Else"),
  edge(sms, endOk),
  edge(stage2, tries),
  edge(tries, saidYes, "loop", "Repeat"),
  edge(tries, endNo, "exit", "Exit"),
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
console.log("Stage collections rebuilt:");
console.log("  • Stage — Opening replies (Welcome) — default: right-person bridge");
console.log("  • Stage — Handle & steer back (Welcome) — default: redirect to purpose");
console.log("One If/Else in the whole script. Wrong number / do-not-call / goodbye end reactively.");
