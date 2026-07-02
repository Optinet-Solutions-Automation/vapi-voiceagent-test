// Seeds phased workflow samples: the conversation is split into reusable
// phase sub-workflows, and each master script branches on the result a phase
// returns. Off-topic replies inside a phase are redirected back to the call
// purpose (redirect scenario + Loop box, capped), while Playbook Q&A handles
// one-off questions without derailing the flow.
//
//   Phase — Opening & Identity   → returns confirmed | wrong_person
//   Phase — Pitch & Redirect     → returns interested | declined
//   Phase — Close & Send Link    → returns done
//   Phase — Claim Reminder       → returns interested | declined
//
//   Sales Call — Phased (example):    Start → Opening → Pitch → Close → End
//   Follow-up — Claim Reminder (example): reuses Opening + Close around a
//   different middle phase — same building blocks, different call purpose.
//
// Idempotent: scenarios are skipped if their intent_key exists; script graphs
// are rebuilt each run. Requires seed-promo-callback.mjs to have run first
// (reuses its promo_* scenarios). Run: node scripts/seed-phased-workflows.mjs
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const sb = createClient(
  "https://mfnebrospbqhbrxfexie.supabase.co",
  "sb_publishable_0CSebHk0k2ToTg7-F4KeDA_ZjRpz7q5"
);

// ── 1. Scenarios ──────────────────────────────────────────────
const scenarios = [
  {
    name: "Opening — right person",
    intent_key: "open_right_person",
    tags: ["Phased Samples", "Greeting"],
    description: "Customer confirms it's them — yes speaking, that's me, this is he/she.",
    response_template: "Perfect, thanks! I'll keep this really quick.",
    action_type: "answer",
    delivery: "verbatim",
    priority: 10,
    mode: "both",
  },
  {
    name: "Opening — wrong person",
    intent_key: "open_wrong_person",
    tags: ["Phased Samples", "Closing"],
    description: "Someone else answered, the person is unavailable, or it's a wrong number.",
    response_template: "Apologize briefly for the mix-up, say you'll try again another time, and wrap up politely.",
    action_type: "answer",
    delivery: "reword",
    priority: 11,
    mode: "both",
  },
  {
    name: "Opening — wrong person goodbye",
    intent_key: "open_wrong_goodbye",
    tags: ["Phased Samples", "Closing"],
    description: "Wrap-up line after reaching the wrong person.",
    response_template: "No worries at all — sorry to bother you. Have a great day!",
    action_type: "end_call",
    delivery: "verbatim",
    priority: 12,
    mode: "both",
  },
  {
    name: "Pitch — the offer",
    intent_key: "pitch_offer",
    tags: ["Phased Samples", "Promotions"],
    description: "Time to present the call's purpose — the welcome promo pitch.",
    response_template:
      "So, the quick reason for my call: since you signed up with us this week, there's a welcome promo already on your account — twenty-five percent off your first month. Easiest is I text you the claim link. Shall I?",
    action_type: "give_offer",
    delivery: "verbatim",
    priority: 13,
    mode: "both",
  },
  {
    name: "Pitch — redirect to purpose",
    intent_key: "pitch_redirect",
    tags: ["Phased Samples", "Objections"],
    description: "Customer drifts off topic, hesitates, or gives a vague answer during the pitch.",
    response_template:
      "Briefly acknowledge what they said, then steer the call back to its purpose — the welcome promo waiting on their account — and kindly re-ask whether you can text them the claim link.",
    action_type: "answer",
    delivery: "reword",
    priority: 14,
    mode: "both",
  },
  {
    name: "Pitch — declined goodbye",
    intent_key: "pitch_declined_goodbye",
    tags: ["Phased Samples", "Closing"],
    description: "Warm no-pressure wrap-up after the customer declined the offer.",
    response_template:
      "That's absolutely fine — the promo stays on your account for seven days if you change your mind. Thanks for your time, and have a lovely day!",
    action_type: "end_call",
    delivery: "verbatim",
    priority: 15,
    mode: "both",
  },
  {
    name: "Reminder — unclaimed promo",
    intent_key: "remind_claim",
    tags: ["Phased Samples", "Promotions"],
    description: "Time to present this call's purpose — remind them the welcome promo is unclaimed.",
    response_template:
      "Quick reminder — your welcome promo is still waiting on your account: twenty-five percent off your first month. Did you get a chance to claim it, or shall I text you the link again?",
    action_type: "give_offer",
    delivery: "verbatim",
    priority: 16,
    mode: "both",
  },
  {
    name: "Reminder — redirect to purpose",
    intent_key: "remind_redirect",
    tags: ["Phased Samples", "Objections"],
    description: "Customer is vague or off topic during the claim-reminder call.",
    response_template:
      "Acknowledge briefly, then bring the call back to its purpose — the unclaimed welcome promo — and offer once more to text the claim link.",
    action_type: "answer",
    delivery: "reword",
    priority: 17,
    mode: "both",
  },
  // Matcher-only "expected reply" (never spoken): the pitch phase branches to
  // a human transfer when this fires.
  {
    name: "Expected reply — wants a human",
    intent_key: "edge_want_human",
    tags: ["Phased Samples", "Reply detector"],
    description:
      "Customer asks to speak to a real person, a human agent, a representative, or a manager.",
    response_template: "",
    action_type: "ignore",
    delivery: "verbatim",
    priority: 27,
    mode: "listener",
  },
  {
    name: "Pitch — transfer to colleague",
    intent_key: "pitch_transfer_line",
    tags: ["Phased Samples"],
    description: "Line spoken while transferring the customer to a human colleague.",
    response_template:
      "Of course — let me connect you with one of my colleagues right now. One moment please.",
    action_type: "answer",
    delivery: "verbatim",
    priority: 28,
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
const scn = (k) => {
  if (!byIntent[k]) {
    console.log(`Missing scenario "${k}" — run seed-promo-callback.mjs first.`);
    process.exit(1);
  }
  return byIntent[k];
};

// ── 2. Script helpers ─────────────────────────────────────────
async function getOrCreateScript(name, description) {
  const { data: found } = await sb.from("listener_scripts").select("id").eq("name", name).maybeSingle();
  if (found) return found.id;
  const { data, error } = await sb.from("listener_scripts").insert({ name, description }).select().single();
  if (error) {
    console.log(`FAILED to create "${name}":`, error.message);
    process.exit(1);
  }
  return data.id;
}

async function rebuild(scriptId, nodes, edges) {
  await sb.from("listener_script_edges").delete().eq("script_id", scriptId);
  await sb.from("listener_script_nodes").delete().eq("script_id", scriptId);
  const ni = await sb.from("listener_script_nodes").insert(nodes.map((n) => ({ ...n, script_id: scriptId })));
  if (ni.error) {
    console.log("FAILED nodes:", ni.error.message);
    process.exit(1);
  }
  const ei = await sb.from("listener_script_edges").insert(edges.map((e) => ({ ...e, script_id: scriptId })));
  if (ei.error) {
    console.log("FAILED edges:", ei.error.message);
    process.exit(1);
  }
}

const step = (label, config, scenario_id, pos_x, pos_y) => ({
  id: randomUUID(),
  type: "step",
  scenario_id: scenario_id ?? null,
  label,
  config,
  pos_x,
  pos_y,
});
const edge = (source, target, handle = "out", label = "") => ({
  id: randomUUID(),
  source_node_id: source.id,
  target_node_id: target.id,
  condition: { kind: "plain", handle },
  label,
});

// ── 3. Phase — Opening & Identity ─────────────────────────────
// Entry If/Else: wrong person → apologize → return wrong_person;
// otherwise thank + bridge → return confirmed.
const openingId = await getOrCreateScript(
  "Phase — Opening & Identity",
  "Reusable opening phase: confirms it's the right person. Returns confirmed | wrong_person."
);
{
  const wrong = step("Wrong person?", { contentType: "ifelse", condBy: "intent", condValue: "open_wrong_person" }, null, 272, 32);
  const apologize = step("Apologize & wrap", { contentType: "scenario" }, scn("open_wrong_person"), 80, 192);
  const retWrong = step("Return: wrong person", { contentType: "return", resultName: "wrong_person" }, null, 80, 336);
  const bridge = step("Thanks — bridge", { contentType: "scenario" }, scn("open_right_person"), 464, 192);
  const retOk = step("Return: confirmed", { contentType: "return", resultName: "confirmed" }, null, 464, 336);
  await rebuild(
    openingId,
    [wrong, apologize, retWrong, bridge, retOk],
    [edge(wrong, apologize, "then", "Then"), edge(wrong, bridge, "else", "Else"), edge(apologize, retWrong), edge(bridge, retOk)]
  );
}

// ── 4. Phase — Pitch & Redirect ───────────────────────────────
// Pitch → said yes? → return interested; wants a human? → transfer; otherwise
// answer & redirect back to the purpose, loop up to 2 more tries, then
// return declined.
const pitchId = await getOrCreateScript(
  "Phase — Pitch & Redirect",
  "Reusable pitch phase with redirect-to-purpose loop and human escalation. Returns interested | declined."
);
{
  const pitch = step("Give the pitch", { contentType: "scenario", candidateScenarioIds: [scn("promo_busy")] }, scn("pitch_offer"), 272, 32);
  const saidYes = step("Said yes to the text?", { contentType: "ifelse", condBy: "intent", condValue: "promo_sms_yes" }, null, 272, 192);
  const retYes = step("Return: interested", { contentType: "return", resultName: "interested" }, null, 48, 352);
  const wantsHuman = step("Wants a human?", { contentType: "ifelse", condBy: "intent", condValue: "edge_want_human" }, null, 464, 352);
  const transfer = step("Hand off to colleague", { contentType: "transfer", number: "+15550100000" }, scn("pitch_transfer_line"), 688, 496);
  const redirect = step(
    "Answer & redirect to purpose",
    { contentType: "scenario", candidateScenarioIds: [scn("promo_not_interested"), scn("promo_busy"), scn("promo_price_question"), scn("promo_how_claim")] },
    scn("pitch_redirect"),
    336,
    496
  );
  const tries = step("Up to 2 more tries", { contentType: "loop", maxLoops: 2 }, null, 336, 640);
  const retNo = step("Return: declined", { contentType: "return", resultName: "declined" }, null, 128, 768);
  await rebuild(
    pitchId,
    [pitch, saidYes, retYes, wantsHuman, transfer, redirect, tries, retNo],
    [
      edge(pitch, saidYes),
      edge(saidYes, retYes, "then", "Then"),
      edge(saidYes, wantsHuman, "else", "Else"),
      edge(wantsHuman, transfer, "then", "Then"),
      edge(wantsHuman, redirect, "else", "Else"),
      edge(redirect, tries),
      edge(tries, saidYes, "loop", "Repeat"),
      edge(tries, retNo, "exit", "Exit"),
    ]
  );
}

// ── 5. Phase — Close & Send Link ──────────────────────────────
const closeId = await getOrCreateScript(
  "Phase — Close & Send Link",
  "Reusable close phase: sends the SMS and confirms. Returns done."
);
{
  const send = step("Send the link", { contentType: "send_sms" }, scn("promo_sms_yes"), 272, 32);
  const retDone = step("Return: done", { contentType: "return", resultName: "done" }, null, 272, 192);
  await rebuild(closeId, [send, retDone], [edge(send, retDone)]);
}

// ── 6. Phase — Claim Reminder (alternate middle phase) ────────
const remindId = await getOrCreateScript(
  "Phase — Claim Reminder",
  "Alternate middle phase: reminds about the unclaimed promo. Returns interested | declined."
);
{
  const remind = step("Remind about the promo", { contentType: "scenario", candidateScenarioIds: [scn("promo_busy")] }, scn("remind_claim"), 272, 32);
  const saidYes = step("Said yes to the text?", { contentType: "ifelse", condBy: "intent", condValue: "promo_sms_yes" }, null, 272, 192);
  const retYes = step("Return: interested", { contentType: "return", resultName: "interested" }, null, 80, 352);
  const redirect = step(
    "Answer & redirect to purpose",
    { contentType: "scenario", candidateScenarioIds: [scn("promo_not_interested"), scn("promo_busy"), scn("promo_how_claim")] },
    scn("remind_redirect"),
    464,
    352
  );
  const tries = step("Up to 2 more tries", { contentType: "loop", maxLoops: 2 }, null, 464, 512);
  const retNo = step("Return: declined", { contentType: "return", resultName: "declined" }, null, 272, 656);
  await rebuild(
    remindId,
    [remind, saidYes, retYes, redirect, tries, retNo],
    [
      edge(remind, saidYes),
      edge(saidYes, retYes, "then", "Then"),
      edge(saidYes, redirect, "else", "Else"),
      edge(redirect, tries),
      edge(tries, saidYes, "loop", "Repeat"),
      edge(tries, retNo, "exit", "Exit"),
    ]
  );
}

// ── 7. Masters: compose the phases ────────────────────────────
async function buildMaster(name, description, middlePhaseId, middleLabel) {
  const id = await getOrCreateScript(name, description);
  const start = {
    id: randomUUID(),
    type: "start",
    scenario_id: null,
    label: "Start call",
    config: {
      mode: "agent_first",
      opening:
        "Hi {{name}}, this is Alex from the customer team. You created an account with us this week and there's a small welcome gift waiting on it — do you have thirty seconds?",
    },
    pos_x: 272,
    pos_y: 16,
  };
  const opening = step("Phase 1 — Opening & Identity", { contentType: "subworkflow", subworkflowId: openingId }, null, 272, 128);
  const confirmed = step("Confirmed it's them?", { contentType: "ifelse", condBy: "result", condValue: "confirmed" }, null, 272, 256);
  const wrongEnd = step("Wrap up — wrong person", { contentType: "end" }, scn("open_wrong_goodbye"), 64, 400);
  const middle = step(middleLabel, { contentType: "subworkflow", subworkflowId: middlePhaseId }, null, 464, 400);
  const interested = step("Wants the link?", { contentType: "ifelse", condBy: "result", condValue: "interested" }, null, 464, 528);
  const close = step("Phase 3 — Close & Send Link", { contentType: "subworkflow", subworkflowId: closeId }, null, 272, 656);
  const declinedEnd = step("Wrap up — no thanks", { contentType: "end" }, scn("pitch_declined_goodbye"), 656, 656);
  const successEnd = step("Wrap up — success", { contentType: "end" }, scn("promo_goodbye"), 272, 784);
  await rebuild(
    id,
    [start, opening, confirmed, wrongEnd, middle, interested, close, declinedEnd, successEnd],
    [
      edge(start, opening),
      edge(opening, confirmed),
      edge(confirmed, middle, "then", "Then"),
      edge(confirmed, wrongEnd, "else", "Else"),
      edge(middle, interested),
      edge(interested, close, "then", "Then"),
      edge(interested, declinedEnd, "else", "Else"),
      edge(close, successEnd),
    ]
  );
  return id;
}

await buildMaster(
  "Sales Call — Phased (example)",
  "Master flow in phases: Opening → Pitch → Close. Each phase is a reusable sub-workflow; off-topic replies are redirected back to the call purpose.",
  pitchId,
  "Phase 2 — Pitch & Redirect"
);
await buildMaster(
  "Follow-up — Claim Reminder (example)",
  "Reuses the Opening and Close phases around a different middle phase — same building blocks, different call purpose.",
  remindId,
  "Phase 2 — Claim Reminder"
);

console.log(`Scenarios added: ${added} (existing kept).`);
console.log("Seeded 4 phase sub-workflows + 2 phased master scripts:");
console.log('  • "Sales Call — Phased (example)"      Opening → Pitch & Redirect → Close');
console.log('  • "Follow-up — Claim Reminder (example)" Opening → Claim Reminder → Close');
console.log("Open either master in the Script Builder; double-click a phase box to preview it.");
