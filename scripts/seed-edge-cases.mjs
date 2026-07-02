// Seeds real-world edge-case scenarios for the welcome-promo campaign — the
// messy replies actual outbound calls get, not the happy path:
//
//   "Who is this?"  "Where did you get my number?"  "Is this a scam?"
//   "Am I talking to a robot?"  "Stop calling me"  "I never signed up"
//   "Call me tomorrow"  "I already claimed it"  "What's the catch?"  "What?"
//
// These are Playbook scenarios, not flow boxes: thanks to the runtime's
// defer-to-Playbook behavior they can fire at ANY point in ANY flow — the
// script stays parked, the reply is answered (with steer-back-to-purpose
// written into the wording), and the flow resumes on the next reply.
// Compliance replies (do-not-call) end the call from anywhere.
//
// Also creates the "Welcome Promo — Full Playbook" collection bundling every
// promo/phase/edge scenario, so activating it scopes the router to this
// campaign (and away from other campaigns' brand lines).
//
// Idempotent. Run: node scripts/seed-edge-cases.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "https://mfnebrospbqhbrxfexie.supabase.co",
  "sb_publishable_0CSebHk0k2ToTg7-F4KeDA_ZjRpz7q5"
);

const scenarios = [
  // ── Compliance first: must fire reliably from anywhere ──
  {
    name: "Edge — do not call / remove me",
    intent_key: "edge_do_not_call",
    tags: ["Edge Cases", "Compliance"],
    description:
      "Customer firmly asks to never be called again — stop calling me, remove me from your list, take me off, this is harassment.",
    response_template:
      "Understood — I'm marking your number so we don't contact you again. Sorry for the disturbance, and have a good day. Goodbye.",
    action_type: "end_call",
    delivery: "verbatim",
    priority: 5,
    mode: "both",
  },
  // ── Suspicion & identity ──
  {
    name: "Edge — who is this?",
    intent_key: "edge_who_is_this",
    tags: ["Edge Cases", "Trust"],
    description: "Customer asks who's calling, who this is, or what company you're from.",
    response_template:
      "Give your name and company again, remind them you're calling about the account they created with us this week, and reassure them it's just a quick courtesy call. Then return to the reason for the call.",
    action_type: "answer",
    delivery: "reword",
    priority: 18,
    mode: "both",
  },
  {
    name: "Edge — where did you get my number?",
    intent_key: "edge_how_got_number",
    tags: ["Edge Cases", "Trust"],
    description:
      "Customer asks where you got their number, how you know them, or why they specifically are being called.",
    response_template:
      "Explain their number comes from the registration they completed on our site this week, and reassure them their details aren't shared with anyone else. Then steer gently back to the welcome promo.",
    action_type: "answer",
    delivery: "reword",
    priority: 19,
    mode: "both",
  },
  {
    name: "Edge — is this a scam?",
    intent_key: "edge_is_this_scam",
    tags: ["Edge Cases", "Trust"],
    description:
      "Customer is suspicious — asks if this is a scam, says it sounds too good to be true, or doubts the call is real.",
    response_template:
      "Stay calm and understanding — say it's smart to be careful. Point out you're not asking for any payment or card details: the discount is already on their account and they can verify it themselves by logging in directly, without any link from you. Offer the text link only if they're comfortable.",
    action_type: "answer",
    delivery: "reword",
    priority: 20,
    mode: "both",
  },
  {
    name: "Edge — are you a robot?",
    intent_key: "edge_are_you_ai",
    tags: ["Edge Cases", "Trust"],
    description: "Customer asks if they're talking to a robot, an AI, or a real person.",
    response_template:
      "Be upfront and light about it: yes, you're a virtual assistant calling on behalf of the company, and a human colleague can follow up if they'd prefer. Then continue the conversation naturally.",
    action_type: "answer",
    delivery: "reword",
    priority: 21,
    mode: "both",
  },
  // ── Data mismatch & timing ──
  {
    name: "Edge — I never signed up",
    intent_key: "edge_never_signed_up",
    tags: ["Edge Cases", "Objections"],
    description:
      "Customer denies registering — says they never signed up, didn't create an account, or has no idea what you're talking about.",
    response_template:
      "Don't argue. Apologize for the possible mix-up and ask if someone else in the household might have used their number. If they're sure it's a mistake, offer to remove their details and wrap up politely.",
    action_type: "answer",
    delivery: "reword",
    priority: 22,
    mode: "both",
  },
  {
    name: "Edge — call me later",
    intent_key: "edge_call_me_later",
    tags: ["Edge Cases", "Objections"],
    description:
      "Customer asks to be called back later, tomorrow, or another time — not a refusal, just bad timing.",
    response_template:
      "Respect it immediately. Offer to simply text the promo link instead so they can look whenever suits them — no call needed. If they'd rather have a callback, confirm that warmly and wrap up.",
    action_type: "answer",
    delivery: "reword",
    priority: 23,
    mode: "both",
  },
  {
    name: "Edge — already claimed it",
    intent_key: "edge_already_claimed",
    tags: ["Edge Cases", "Q&A"],
    description: "Customer says they already claimed, used, or received the promo or the text.",
    response_template:
      "Oh perfect — then you're all set; it can only be claimed once. Enjoy it, and thanks for being with us!",
    action_type: "answer",
    delivery: "verbatim",
    priority: 24,
    mode: "both",
  },
  {
    name: "Edge — what's the catch?",
    intent_key: "edge_whats_the_catch",
    tags: ["Edge Cases", "Q&A"],
    description:
      "Customer asks what the catch is, whether it's really free, or what conditions are attached.",
    response_template:
      "No catch — the discount is already applied to your account, there's nothing to pay to see it, and you can cancel anytime. The text link just takes you straight there.",
    action_type: "answer",
    delivery: "verbatim",
    priority: 25,
    mode: "both",
  },
  {
    name: "Edge — repeat that?",
    intent_key: "edge_repeat_that",
    tags: ["Edge Cases", "Q&A"],
    description:
      "Customer didn't hear or didn't understand — asks you to repeat, say that again, or what did you say.",
    response_template: "Repeat your last point once more, slower and in fewer words. Don't add new information.",
    action_type: "answer",
    delivery: "reword",
    priority: 26,
    mode: "both",
  },
];

const { data: existing } = await sb.from("listener_handlers").select("id, intent_key");
const have = new Set((existing ?? []).map((r) => r.intent_key));
let added = 0;
for (const s of scenarios) {
  if (have.has(s.intent_key)) continue;
  const { error } = await sb.from("listener_handlers").insert(s);
  if (error) {
    console.log("FAILED", s.intent_key, error.message);
    process.exit(1);
  }
  added++;
}

// ── Campaign collection: scope the router to this campaign's scenarios ──
const COLLECTION = "Welcome Promo — Full Playbook";
const PREFIXES = ["promo_", "open_", "pitch_", "remind_", "edge_"];

let { data: col } = await sb.from("listener_collections").select("id").eq("name", COLLECTION).maybeSingle();
if (!col) {
  const { data, error } = await sb
    .from("listener_collections")
    .insert({ name: COLLECTION, description: "Everything the welcome-promo campaign can say or match — flow lines, Q&A, and real-world edge cases." })
    .select()
    .single();
  if (error) {
    console.log("FAILED collection:", error.message);
    process.exit(1);
  }
  col = data;
}
const { data: all } = await sb.from("listener_handlers").select("id, intent_key");
const memberIds = (all ?? []).filter((h) => PREFIXES.some((p) => h.intent_key.startsWith(p))).map((h) => h.id);
await sb.from("listener_collection_handlers").delete().eq("collection_id", col.id);
const mi = await sb.from("listener_collection_handlers").insert(memberIds.map((handler_id) => ({ collection_id: col.id, handler_id })));
if (mi.error) {
  console.log("FAILED members:", mi.error.message);
  process.exit(1);
}

console.log(`Edge scenarios added: ${added} (existing kept).`);
console.log(`Collection "${COLLECTION}" rebuilt with ${memberIds.length} scenarios.`);
console.log("Activate it in the Listener Lab → Collections drawer when testing the promo");
console.log("flows, so the router matches THIS campaign's lines (not other brands').");
