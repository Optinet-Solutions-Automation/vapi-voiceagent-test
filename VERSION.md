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
