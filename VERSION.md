# Listener Lab — Version History

The Listener Lab is the AI voice-agent training tool inside this app. It pairs a
short, behaviour-only agent with a backend "listener" that feeds the right line
at the right moment, driven by an editable library of scenarios.

The client-facing user manual lives at **`Listener-Lab-User-Manual.pdf`**
(source: `docs/listener-lab-manual.html`).

---

## v2.2 — current

- **Flows defer off-script questions to the Playbook** — when the customer's
  reply matches a Playbook scenario that the flow's next step doesn't expect
  (no Then branch fired on it, no matching scenario/candidate at the landing
  box), the flow stays parked, the reactive listener answers, and the next
  reply resumes the script where it left off. Previously a wired flow consumed
  every turn, so questions fell down Else branches. The graph walk is now
  atomic: state and logs commit only when the flow consumes the turn.
- **Type lines directly in the builder** — Scenario and End boxes now open
  with a "What the agent says" editor (Exact words / Just the gist delivery,
  plus an optional "when does this fit?" hint). Saving the script creates or
  updates the Playbook scenario automatically; new lines are tagged with the
  script's name. Reusing an existing scenario, candidates, and tag scope moved
  under an Advanced disclosure. Canvas boxes show the line itself as their
  subtitle.
- **Example campaign agent** — `scripts/seed-promo-callback.mjs` seeds
  "Welcome Promo — New Signups": call a client who registered this week and
  offer a promo, with SMS follow-up, an objection nudge, and off-script Q&A
  scenarios.
- **Sub-workflow phases actually work** — two runtime fixes: a sub-workflow's
  result was consumed one step early, so an If/Else-on-result box always took
  Else; and a sub-workflow's entry box was only used as a position, so a
  phase's first line was skipped on entry. Results now live until the turn is
  consumed, and a non-Start entry box runs when its phase is entered.
- **Phased samples** — `scripts/seed-phased-workflows.mjs` seeds reusable
  phase sub-workflows (Opening & Identity, Pitch & Redirect, Close & Send
  Link, Claim Reminder) and two masters composed from them: "Sales Call —
  Phased (example)" and "Follow-up — Claim Reminder (example)". Off-topic
  replies are redirected back to the call purpose via a redirect scenario +
  capped Loop box; one-off questions fall through to the Playbook.
- **Script picker on the Listener Lab page** — choose which script drives the
  next test call (or none — Playbook only) without opening the builder.
- **If/Else speaks CRM** — the reply condition is described in plain words
  ("they agree — yes, sure, text me"); Save creates a speak-nothing *Reply
  detector* entry the router matches against. Matching an existing scenario
  moved under Advanced, grouped by purpose.
- **Complete palette** — Send SMS, Transfer to human, and Return result are
  now draggable boxes (they existed in the runtime but not the palette, so
  phases weren't buildable by hand). SMS and Transfer boxes get inline line
  editors like Scenario boxes.
- **Result dropdown** — an If/Else on a sub-workflow result now offers the
  results actually declared by the connected phase's Return boxes, instead of
  free text on both ends (where one typo silently meant "always Else").
- **Save-time checks** — saving a script lists non-blocking warnings: boxes
  with no line, If/Else with a missing Then/Else arrow or no condition, Loop
  without Repeat/Exit, unpicked workflows/collections, unconnected boxes.
- **Presentation demos** — `scripts/seed-demo-basic.mjs` seeds "Demo — Basic
  Welcome Call" (one screen, seven boxes: offer → yes? → text link → goodbye
  with one nudge) for a first demo; "Sales Call — Phased (example)" is the
  complete showcase, now with a real Send SMS box in the Close phase and a
  "wants a human?" branch to a Transfer box in the Pitch phase.
- **The script owns the call** — while a script is active, the assistant's
  `get_offer` / `send_sms` tools no longer free-lance (previously the agent
  could pull another campaign's offer and speak it right before the script's
  own pitch — two competing offers in one call).
- **Per-script opening line** — the Start box has an "Opening line" editor;
  test calls use it as the first message (falling back to the global
  first_message scenario). Demo scripts ship with their own openings, and
  `scripts/seed-demo-campaign-setup.mjs` switches the lab persona/collection/
  script to the welcome campaign in one command (then Save Configuration once).
- **Injection latency** — the webhook's transcript hot path now runs its
  independent reads in parallel (recent turns, settings, handlers, cooldown,
  flow state) instead of sequentially.
- **Lucky Seven campaign setup** — "Alex with BrightPath" mid-call came from
  the persona prompt (lab_settings.short_prompt, set by the demo campaign
  seed and auto-pushed on Start Call). `seed-lucky7-campaign-setup.mjs` now
  flips the whole lab to Lucky Seven in one command: Tom persona on the same
  hardened template, the "Lucky Seven — Welcome Call" script (free spins →
  consent → SMS → goodbye, opening from the global first_message), and the
  Lucky7even collection — now correctly scoped to Lucky Seven's scenarios
  plus brand-neutral edge cases instead of every handler in the database.
- **Skip-ahead: a yes never triggers a re-pitch** — reactive answers move the
  conversation forward while the flow position lags; consent then arrived
  while the flow still sat before the pitch box, and the walk re-pitched over
  the customer's yes (seen in several calls). If a speaking box has no line
  for the reply but the If/Else right after it recognizes it, the box is now
  passed through silently and the branch fires (logged as skipped_ahead).
- **Builder: scenarios stay the source of truth** — the Description field is
  a textarea directly under Label; "What the agent says" is labeled tentative
  (it IS the scenario's line — editing it edits the Playbook scenario for
  every script/campaign using it); Collection boxes preview their default
  line read-only; new lines default to "Just the gist" with Exact words
  reserved for prices/terms/compliance.
- **One response per customer turn** — the agent answers naturally within
  ~2s while the scripted line lands at ~5s, producing stitched double
  responses ("Right. Totally fair to ask. Right. Totally fair to ask") and
  questions asked twice. Injections now check the agent_said log: if the
  agent already replied to this turn, the line is delivered as a
  CONTINUATION ("continue with ONLY the following, without repeating or
  re-acknowledging") — and verbatim lines become continuation notes instead
  of restating on top. Injected events log mode: fresh vs
  continue_after_reply.
- **Fifth live-call QA round** — the merge worked in production ("who is
  this and how did you get my number?" → one flowing paragraph). Remaining
  defects fixed: the wait-phrases were the agent announcing its own tool
  calls ("this will just take a sec"), now a hard rule — call tools
  silently; a gated tool result leaked to the customer ("it shows up
  automatically at the right step"), all four now carry an "INSTRUCTION TO
  YOU — never repeat this" prefix; and the router hallucinated an intent key
  (promo_redirect) that passed the threshold — classified intents are now
  validated against real handler keys.
- **Meeting fixes (Val's review)** — three upgrades. (1) *Merged replies*: the
  router now returns every intent a reply addresses (up to three); when a
  multi-part reply ("how much is it — and where did you get my number?")
  matches several collection members or Playbook answers, their content is
  folded into ONE briefing: a single short paragraph, exact facts kept
  word-accurate. Branching also matches on any of the intents, so "sure,
  text me — oh and how much?" still takes the consent branch. (2)
  *Interruption buffer*: acknowledgements ("okay", "uh-huh", "got it") never
  stop the agent; three or more words do; "stop"/"wait" cut through
  instantly. And the listener anticipates: partial transcripts warm up the
  router while the customer is still speaking, so the classification is
  usually ready the moment they stop. (3) *Latency-matched fillers*: instant
  answer → no filler; short beat → tiny filler; info being fetched → a
  bridge phrase that flows into the answer — never dead air.
- **Fourth live-call QA round** — the double goodbye is gone: in script mode
  the agent's end_call_goodbye tool stands down (the flow's End box or a
  reactive end_call scenario owns the wrap-up and the hang-up). The persona
  gained a [Hard rules] tail section — forbidden wait-phrases, one reply per
  turn (never two variants back to back), never invent names/facts, max one
  filler per turn — placed last where models comply best. Idle re-engagement
  waits 10s instead of 8.
- **Third live-call QA round** — a consent after the retry cap got the
  DECLINED goodbye: the loop box sat before the consent check, so the yes
  itself bumped the counter out the Exit. All three loops (stage script and
  both phased subs) are rewired: consent is checked BEFORE a round is
  counted. A stale-fragment re-check now runs right before speaking (flow and
  reactive) — a newer customer fragment landing mid-walk supersedes the
  reply, killing the overlapping double-responses. Interruptions are
  analyzed, not knee-jerk: the customer must say 2+ words to stop the agent
  (stopSpeakingPlan), and smart endpointing + 0.8s wait coalesce split
  finals at the source (startSpeakingPlan). The persona now has a company
  name (BrightPath — replace per campaign; the agent had invented one) and a
  total ban on wait-phrases ("hold on a second" slipped past the old list).
- **Second live-call QA round** — "one moment"/"hold on" are now explicitly
  banned in the persona (casual fillers only: mm-hmm, uh-huh, wait—, mmm).
  Split final transcripts: a stale fragment is superseded — only the newest
  customer fragment gets a response, so the agent no longer answers twice
  back-to-back. The agent's actual spoken words are logged (agent_said,
  visible in the monitor) and fed to the router's context, so "okay, sure"
  right after "want me to text it?" reads as consent instead of noise. New
  edge scenario: "email me instead" (offers text, never promises email),
  also a Stage 2 member.
- **The flow owns the pitch too** (QA of a live stage-script call): a
  misrouted "sure, I have time" let the reactive layer deliver the pitch,
  desyncing the flow for the whole call — the agent later claimed to send a
  text that never existed. give_offer now joins send_sms as flow-owned; the
  gated tools explicitly forbid "checking" filler and false "sent" claims;
  promo_hook's description is speak-only so agreements can't match it.
  **Start Call now auto-pushes the configuration** (persona, tools, webhook,
  idle plan) onto the assistant — Save Configuration is no longer a landmine.
  The persona also varies its fillers ("mm-hmm", "uh-huh", "right", "one
  sec") instead of repeating "just a sec".
- **Stage collections — replies pick from a set, not nested If/Else** — a
  Collection box is now a full conversation stage: the customer's reply picks
  the member scenario to speak, a configurable **Default line** covers
  everything else (previously the fallback member was an arbitrary row), and a
  loop keeps the stage alive until the one If/Else exit (consent) fires.
  `scripts/seed-stage-collections.mjs` seeds two stage collections (Opening
  replies; Handle & steer back) and "Welcome Call — Stage Collections
  (example)" — a full call with exactly one If/Else. Rule of thumb: stage
  members keep the conversation going, the If/Else advances it, and reactive
  end_call scenarios (wrong number, do-not-call, goodbye) exit from anywhere.
- **A wiser listener** — the router now has explicit rules: back-channel and
  fillers ("okay", "k", "uh-huh", "I hear you"), fragments, a mid-call
  "hello?", and noise are acknowledgements → none; bare agreement only maps
  to a consent handler if the agent's last line asked that question. The flow
  treats below-threshold guesses as "none" (a 0.42-confidence "consent" once
  marched a live question straight into the goodbye). Split final transcripts
  ("Sure." + "Whatever." one second apart) no longer double-advance the flow —
  an optimistic lock on flow state drops the losing turn, so a step is never
  spoken twice. In script mode `lookup_answer` stands down (the listener
  already pushes the same answer — the customer was hearing everything twice).
- **Playbook gets its own page** — Scenarios and Collections moved from
  drawers on the Listener Lab to `/playbook`. The Listener Lab is now the
  campaign test console, with the workflow spelled out in order: 1. Playbook →
  2. Script Builder → 3. Configuration (push persona) → 4. pick script & call
  → 5. Logs.
- **Engagement, not recital** — configuring an assistant now sets an idle
  plan (up to two natural "still with me?" re-engagements after 8s of
  silence — the listener loop is transcript-driven, so silence otherwise
  meant nothing ever happened). Every "gist" briefing is grounded in the
  customer's actual words ("The customer just said … react to that first"),
  and the demo persona gained an [Engagement] section: mirror their words,
  never repeat a sentence, bridge to supplied lines instead of reciting them.
- **Reactive/script collision fixes** (from a live test call): SMS
  confirmations are flow steps — when a script is active the reactive layer
  never speaks one out of order (a misclassified "yes, sure" used to trigger
  "I'm sending it right now" before any offer was pitched; the flow now speaks
  its own step instead). The cooldown only throttles reactive whispers, never
  flow advancement. Re-injecting the same briefing within 45s is suppressed
  (no more "I've sent the details to this number" ×5). Test calls log the
  opening line as an agent turn so the router classifies the first reply in
  context, and the repeat-that briefing now says rephrase, never repeat.
- **Real-world edge cases** — `scripts/seed-edge-cases.mjs` seeds the messy
  replies actual calls get ("Who is this?", "Where did you get my number?",
  "Is this a scam?", "Are you a robot?", "I never signed up", "Stop calling
  me", "Call me later", "Already claimed it", "What's the catch?", "What?").
  They're Playbook scenarios with steer-back-to-purpose wording, so they fire
  from any point in any flow via defer; do-not-call ends the call from
  anywhere. Also creates the "Welcome Promo — Full Playbook" collection to
  scope the router to this campaign's lines.

## v2.1

- **Multiple scenarios per box** — a Say/Branch box can list candidate scenarios
  (the router picks the best fit at that step), combined with per-step tag scope.
- **Script Builder canvas polish** — drag boxes from the palette onto a dotted
  grid; nodes snap to the grid.
- **Sample script** — a ready-made "Sample — Offer Flow" to open in the builder
  (`scripts/seed-sample-script.mjs`).
- Manual refreshed to v2.1.

## v2.0 — Scripts, Collections, Tags

- **Script Builder** — visual, n8n-style call-flow on top of scenarios. Node
  types: Start (agent-first / wait-for-customer), Say, Branch, Send SMS, Set
  Variable, Transfer to Human, End Call. Edges branch by intent or tag with an
  "otherwise" fallback. A runtime graph-walker advances the flow per call while
  reactive scenarios still handle off-script turns.
- **Collections** — named, campaign-ready bundles of scenarios; setting one
  active scopes which scenarios the listener uses for a test call.
- **Tags** — multiple category labels per scenario, with filtering.
- **Terminology** — "Handler" → **Scenario**, "Organizer" → **Playbook**.
- **Logs** — reviewing a past run shows its full transcript beside the listener
  timeline.

## v1.0 — Listener Lab foundation

- **Playbook of scenarios** — each scenario pairs a situation (match guidance +
  intent) with a response and a delivery mode (**verbatim** = spoken word-for-word,
  **reword** = rephrased by the agent).
- **Two ways knowledge reaches the agent** — tools (the agent pulls an answer)
  and a live listener (the backend pushes an answer mid-call).
- **Live test calls + Listener Monitor** — run browser calls and watch
  heard → classified → injected/skipped with per-injection latency.
- **Configuration** — one form for assistant, voice, short behaviour prompt,
  webhook URL, router model, confidence threshold, cooldown.
- Seeded example built from a real LuckySeven sales script
  (`scripts/seed-lucky7-handlers.mjs`).

---

## Database migrations (run in the Supabase SQL editor, in order)

1. `supabase-migration-listener-lab.sql` — scenarios, settings, call events
2. `supabase-migration-listener-delivery.sql` — verbatim/reword delivery
3. `supabase-migration-listener-groups.sql` — handler group (legacy, now tags)
4. `supabase-migration-listener-collections.sql` — tags + collections
5. `supabase-migration-listener-scripts.sql` — scripts (visual flow builder)
