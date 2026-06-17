// Seeds the Listener Lab Organizer with handlers decomposed from the
// LuckySeven Casino production prompt, and saves the matching short
// behavior-only prompt to lab_settings.
//
// Each handler has a `delivery` mode:
//   verbatim → the agent SPEAKS response_template word-for-word (VAPI `say`)
//   reword   → response_template is a [STAFF] briefing the agent rephrases
//
// Run: node scripts/seed-lucky7-handlers.mjs   (idempotent — skips existing intent_keys)
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "https://mfnebrospbqhbrxfexie.supabase.co",
  "sb_publishable_0CSebHk0k2ToTg7-F4KeDA_ZjRpz7q5"
);

const handlers = [
  // ── Special: call opening (not routed — read at call start) ──
  {
    name: "First Message (call opening)",
    intent_key: "first_message",
    description:
      "SPECIAL: not routed — this template is spoken as the agent's opening line when the call starts. Use {{name}} for the client's name.",
    response_template:
      "Hi {{name}}, this is Tom from Lucky Seven. I saw you registered an account recently at Lucky7even.com — does that sound familiar?",
    action_type: "answer",
    delivery: "verbatim",
    priority: 0,
    mode: "both",
  },
  // ── Safety-critical (highest priority — these MUST fire reliably) ──
  {
    name: "Gambling Problem",
    intent_key: "gambling_problem",
    description:
      "Customer says they have a gambling problem, gambling addiction, are trying to quit gambling, or that gambling has hurt them or their family.",
    response_template:
      "I really appreciate you telling me that, and I want you to know support is available — please do reach out to your local gambling helpline. Take good care of yourself. Goodbye.",
    action_type: "end_call",
    delivery: "verbatim",
    priority: 1,
    mode: "both",
  },
  {
    name: "Do Not Call / Opt Out",
    intent_key: "do_not_call",
    description:
      "Customer is angry, says do not call again, remove me from your list, stop calling, not interested in gambling ever, or any firm request to never be contacted.",
    response_template:
      "I'm sorry for the interruption — I'll make sure we don't call you again. Thanks for your time, and goodbye.",
    action_type: "end_call",
    delivery: "verbatim",
    priority: 2,
    mode: "both",
  },
  // ── Offer flow ──
  {
    name: "Main Offer — 20 No-Deposit Free Spins",
    intent_key: "main_offer",
    description:
      "Customer shows interest, asks what the call is about, what the offer/bonus/surprise is, or says okay tell me more.",
    response_template:
      "Great news — you've got twenty free spins waiting in your account already, no deposit needed. You just log in and activate them, and they're available today only. Would it be alright if I text you the details?",
    action_type: "give_offer",
    delivery: "verbatim",
    priority: 10,
    mode: "both",
  },
  {
    name: "Upsell — 300% Deposit Bonus",
    intent_key: "upsell_offer",
    description:
      "Customer asks if there is anything more, another bonus, a deposit offer, or about the extra treat mentioned in the SMS.",
    response_template:
      "There's also an exclusive bonus — a three hundred percent match up to five hundred dollars on a deposit, with just a thirty dollar minimum. The twenty free spins themselves still need no deposit at all.",
    action_type: "answer",
    delivery: "verbatim",
    priority: 11,
    mode: "both",
  },
  {
    name: "Send SMS Consent",
    intent_key: "sms_consent",
    description:
      "Customer agrees to receive details by SMS/text, says yes send it, text me, or asks for the details in writing.",
    response_template:
      "Perfect — I'll send that over to the number I reached you on right now. It'll have your free spins, plus one extra special treat you can claim.",
    action_type: "send_sms",
    delivery: "verbatim",
    priority: 12,
    mode: "both",
  },
  {
    name: "Not Interested (soft)",
    intent_key: "not_interested_soft",
    description:
      "Customer politely declines, says not right now, maybe later, or is hesitant but NOT angry and NOT asking to never be called.",
    response_template:
      "Acknowledge kindly without pushing. Offer once to text the details so they can look later; if they still decline, thank them warmly and wrap up.",
    action_type: "answer",
    delivery: "reword",
    priority: 13,
    mode: "both",
  },
  {
    name: "No Time / Busy",
    intent_key: "no_time",
    description:
      "Customer says they are busy, driving, at work, in a meeting, or cannot talk right now.",
    response_template:
      "Respect their time right away. Offer to text the info so they can read it later, then wrap up quickly.",
    action_type: "answer",
    delivery: "reword",
    priority: 14,
    mode: "both",
  },
  // ── Q&A knowledge (only surfaces when asked) ──
  {
    name: "Wagering Requirements",
    intent_key: "wagering_requirements",
    description:
      "Customer asks about wagering requirements, playthrough, rollover, or conditions on winnings.",
    response_template: "The wagering requirement is forty times the deposit.",
    action_type: "answer",
    delivery: "verbatim",
    priority: 20,
    mode: "both",
  },
  {
    name: "Minimum Deposit",
    intent_key: "minimum_deposit",
    description:
      "Customer asks how much they need to deposit, the minimum deposit, or what it costs to claim.",
    response_template:
      "There's no deposit needed at all for the twenty free spins. The thirty dollar minimum only applies if you'd like the extra bonus offer.",
    action_type: "answer",
    delivery: "verbatim",
    priority: 21,
    mode: "both",
  },
  {
    name: "Where to Find the Spins",
    intent_key: "where_find_spins",
    description:
      "Customer asks where the free spins are, where to see them on the website, or says they cannot find them.",
    response_template:
      "You'll find them under the notifications icon in the top right corner of the page. If you can't spot it, our live chat team can help you right away.",
    action_type: "answer",
    delivery: "verbatim",
    priority: 22,
    mode: "both",
  },
  {
    name: "Which Game",
    intent_key: "which_game",
    description:
      "Customer asks what game the free spins are for or what slot they can play.",
    response_template:
      "The game will be shown to you once the free spins appear in your account.",
    action_type: "answer",
    delivery: "verbatim",
    priority: 23,
    mode: "both",
  },
  {
    name: "Website URL",
    intent_key: "website_url",
    description:
      "Customer asks for the website, the link, the URL, or where to log in.",
    response_template:
      "The website is w w w dot lucky seven even dot com — that's lucky, the number seven, e-v-e-n, dot com.",
    action_type: "answer",
    delivery: "verbatim",
    priority: 24,
    mode: "both",
  },
  {
    name: "Claim Limit",
    intent_key: "claim_limit",
    description:
      "Customer asks how many times they can claim the offer or if they can get it again.",
    response_template: "The offer can only be claimed once.",
    action_type: "answer",
    delivery: "verbatim",
    priority: 25,
    mode: "both",
  },
  {
    name: "How Did You Get My Number",
    intent_key: "how_got_number",
    description:
      "Customer asks how you got their number, who gave you their contact details, or why you are calling them specifically.",
    response_template:
      "Reassure them: they recently registered an account at Lucky7even.com, which is where the number came from. Then gently steer back to the conversation.",
    action_type: "answer",
    delivery: "reword",
    priority: 26,
    mode: "both",
  },
  {
    name: "Login Help",
    intent_key: "login_help",
    description:
      "Customer says they cannot log in, forgot their password, or have account access trouble.",
    response_template:
      "Point them to the live chat support team on the website, or walk them through the reset-password option on the login page. Do not make account changes yourself.",
    action_type: "answer",
    delivery: "reword",
    priority: 27,
    mode: "both",
  },
  {
    name: "Deposit In Progress",
    intent_key: "deposit_in_progress",
    description:
      "Customer says they are depositing right now, just made a deposit, or completed a deposit while on the call.",
    response_template:
      "Congratulate them warmly and encourage them to stay active for more promotions, then move to wrap up.",
    action_type: "answer",
    delivery: "reword",
    priority: 28,
    mode: "both",
  },
  {
    name: "Wrong Person / Unavailable",
    intent_key: "wrong_person",
    description:
      "Someone other than the customer answered, or says the customer is not here, unavailable, or you have the wrong number.",
    response_template:
      "No problem at all — I'll try again another time. Thanks, and have a great day!",
    action_type: "end_call",
    delivery: "verbatim",
    priority: 29,
    mode: "both",
  },
  {
    name: "Goodbye",
    intent_key: "goodbye",
    description:
      "Conversation has naturally concluded — customer says goodbye, thanks, see you, or confirms they are all set.",
    response_template:
      "Thanks so much for your time today — have a wonderful day. Goodbye!",
    action_type: "end_call",
    delivery: "verbatim",
    priority: 30,
    mode: "both",
  },
];

const SHORT_PROMPT = `[Identity] You are Tom — a warm, natural-sounding voice agent for Lucky Seven Casino, calling newly registered customers.

[Delivery & personality] Calm, human, and easy to talk to. Never rushed or breathy; enunciate clearly and mind your pacing. Keep replies short — one or two sentences — and let the customer lead. Friendly, not over-enthusiastic. Pronounce the brand "Lucky Seven". Ignore background noise. Never invent details.

[How knowledge reaches you] You don't know offer details, prices, terms, or policies on your own — your lines are supplied to you in the moment.
- Most lines are spoken to the customer for you; just keep your tone warm and natural around them.
- A system note starting with [STAFF] is a briefing: work that information into your next reply in your own words. Never mention staff, notes, tools, or systems, and never read a [STAFF] note out loud verbatim.
- If you're asked something and have no line or note, call lookup_answer. Use get_offer to present the deal, send_sms to text details, and end_call_goodbye to wrap up.

[Fallback] With no line and no note, stay brief and human — acknowledge warmly and say you'll check on that.`;

const { data: existing } = await sb.from("listener_handlers").select("intent_key");
const have = new Set((existing ?? []).map((r) => r.intent_key));
let added = 0;
let skipped = 0;
for (const h of handlers) {
  if (have.has(h.intent_key)) {
    skipped++;
    continue;
  }
  const { error } = await sb.from("listener_handlers").insert(h);
  if (error) {
    console.log("FAILED", h.intent_key, error.message);
    continue;
  }
  added++;
}
const { error: se } = await sb
  .from("lab_settings")
  .update({ short_prompt: SHORT_PROMPT, updated_at: new Date().toISOString() })
  .eq("id", "default");

console.log(`handlers added: ${added}, skipped (already existed): ${skipped}`);
console.log(
  "short prompt saved: " + (se ? "FAILED " + se.message : `OK (${SHORT_PROMPT.length} chars)`)
);
