# Voizo × Script Engine — Migration Plan

**Audience:** the Claude instance working on `optinet-solutions-sandbx/Voizo`, plus the humans reviewing it.
**Source repo (this document lives there):** https://github.com/Optinet-Solutions-Automation/vapi-voiceagent-test
**Source DB (engine + builder data):** Supabase `https://mfnebrospbqhbrxfexie.supabase.co` (anon key hardcoded in `lib/supabase.ts`)
**Target:** the Voizo campaign platform (Next 16 / App Router, Supabase `voizo-sandbox`, Vercel + crons, FreeSWITCH→VAPI SIP bridge)
**Date:** 2026-07-11

---

## 0. TL;DR

Add a second campaign mode — **`agent_mode: 'script'`** — to Voizo's Add Campaign wizard. Instead of picking a raw VAPI assistant + hand-written prompt, the operator picks a **Script** (a flow built in the Script Builder: boxes, arrows, collections of Q&A scenarios). At launch, Voizo **still clones a VAPI assistant and leases a SIP slot exactly as today** — the only difference is the clone's configuration: a *composed* prompt (persona + hard rules + standing answers + the script's entry stage), richer `serverMessages`, and `server.url` pointing at a new webhook that runs the ported Script Engine during the call and hands `end-of-call-report` to Voizo's existing outcome pipeline.

**Nothing about agent-mode campaigns changes.** Dialer, SIP pool, scheduler, chain-next, SMS, QA, prompt versioning — all untouched for existing campaigns, and mostly *reused verbatim* for script campaigns.

What gets ported into the Voizo repo (~7,500 lines total, all self-contained):
- The engine: `lib/lab-*.ts` (7 files) + 3 API routes (`webhook`, `watch`, `configure-assistant`-as-a-lib)
- The UI: Script Builder (canvas + run dock), Playbook (scenarios), Collections (~4,100 lines)
- 8 tables (DDL below) into the voizo-sandbox DB

---

## 1. What the Script Engine is (architecture you are inheriting)

The engine is a **brief-ahead runtime** on top of VAPI. Understand this model before porting; it explains every design decision in the code.

1. **Authoring**: operators draw a graph — Start box (opening line), Scenario boxes (a line to speak), Collection boxes (a set of Q&A scenarios the agent may answer *in place*), End boxes (goodbyes), plus **reply connectors** on each box (green dots: "when the customer says X → follow this arrow"). Content lives in the **Playbook** (`listener_handlers`): every spoken line and every Q&A answer is an authored scenario with a `delivery` choice (`reword` = agent says it naturally; `verbatim` = word-for-word). Connector *matchers* are also handler rows (`action_type='ignore'`, `mode='listener'`) but they are routing plumbing — deliberately hidden from the Playbook UI and never collectible.
2. **Compile, don't interpret**: the runtime never picks lines reactively. Each node's outgoing neighborhood compiles into a `[CURRENT STAGE]` menu (`lib/lab-briefing.ts`) that is pushed to the VAPI model **while the agent is speaking** (free time — zero customer-facing latency). The model answers the customer *natively, at VAPI speed*, choosing among authored lines only. A `[STANDING ANSWERS]` bank (all collections the script references) backs every stage so off-path questions always have an authored answer.
3. **The listener** (webhook, `app/api/lab/webhook/route.ts`): classifies each final transcript (OpenAI router, 3-tier: quick-words → fast → full, 4s timeout + retry), **arbitrates interruptions** (channel noise like "hello?"/"can you hear me" never advances the flow; noise that physically cut the agent off triggers a "resume where you stopped" nudge), **navigates** (fires the matching connector, advances `lab_call_flow_state` under an optimistic lock, arms the next stage), and runs **actions** (simulated SMS, hangups, exact-line goodbyes via `say`).
4. **The observer**: audits every turn (expected-vs-heard, logged in `lab_call_events`) and **reconciles every outgoing briefing against the whole conversation** (`composeArmedBriefing`): lines already spoken get "ALREADY COVERED — rephrase, don't recite" marks (stem-overlap ≥60%, annotate-never-delete), and authored statements the customer never heard come back as "Still OWED" debts (cap 2, self-clearing).
5. **The watchdog** (`lib/lab-watchdog.ts`): serverless-proof delivery guard. Vercel freezes background timers (`after()`+`setTimeout` provably never ran in prod), so all timing checks are **event-driven**: they ride incoming webhook messages and a 1.2s browser poll (`/api/lab/watch`) during attended test runs. It guards triggered deliveries (retrigger once, then a red error event), executes reworded-goodbye hangups, and drives Wait-box silence timeouts.

**Strictness principle (product law, do not relax):** the script is the contract. The model may only speak authored lines (reworded or verbatim), the approved filler list, and one-sentence neutral bridges. When a defect shows the model inventing content, tighten the prompt/engine — never argue for flexibility. Recent live QA (10-call sweep, 2026-07-09) shows the current engine holding this while answering at native speed.

### 1.1 Code manifest (port these; line counts as of commit `2e56239`)

| File | Lines | Role | Coupling |
|---|---|---|---|
| `lib/lab-db.ts` | 771 | All Supabase access for the 8 tables + event helpers (row-id anchors, corpus, visited nodes) | isomorphic client (`lib/supabase.ts`) |
| `lib/lab-flow.ts` | 97 | Graph walker primitives (`pickNextEdge` — intent order matters; timeout edges excluded) | pure |
| `lib/lab-router.ts` | 131 | OpenAI classification (multi-intent, expected-first ordering, fast tier, 4s timeout ×1 retry) | `OPENAI_API_KEY` (+`OPENAI_BASE_URL` for the test harness) |
| `lib/lab-briefing.ts` | 235 | Stage-menu compiler + standing answers + observer pass (`composeArmedBriefing`) | lab-db, lab-flow |
| `lib/lab-watchdog.ts` | 212 | `checkDelivery` + `checkWaitTimeout` (event-driven clocks) | lab-db, lab-control, lab-briefing |
| `lib/lab-control.ts` | 76 | VAPI control-URL client (`say`, `add-message` staff notes, `end-call`) | `VAPI_PRIVATE_KEY` fallback |
| `lib/lab-tools.ts` | 105 | `LAB_OPERATING_RULES` (hard rules 1–7) + tool definitions | pure |
| `app/api/lab/webhook/route.ts` | 1511 | THE runtime: transcript ladder, backchannel gate, interruption arbiter, flow walk, arming, actions | all of the above |
| `app/api/lab/watch/route.ts` | 26 | Poll-clock tick (`checkDelivery` + `checkWaitTimeout`) | lab-watchdog |
| `app/api/lab/configure-assistant/route.ts` | 217 | Prompt composer + VAPI assistant PATCH (→ becomes a lib in Voizo, §5.3) | lab-briefing, lab-tools |
| `components/lab/ScriptBuilder.tsx` | 3177 | Canvas (xyflow — Voizo already ships `@xyflow/react` 12), drawers, preflight QA gate, run dock, history/replay, undo/redo | lab-db from browser |
| `components/lab/OrganizerTable.tsx` | 615 | Playbook scenario table (matchers filtered out) | lab-db |
| `components/lab/CollectionsManager.tsx` | 297 | Collections CRUD (matchers uncollectible) | lab-db |
| `app/playbook/page.tsx`, `app/script-builder/` | ~50 | Page shells | — |
| `lib/voices.ts` | 22 | Voice list — **reconcile with Voizo's `KNOWN_VOICES` allowlist in `cloneAssistant.ts`; keep one source** | — |

Also worth reading, not porting: `docs/listener-lab-manual.html` (user manual), `KANBAN.md` (full change history with PMS ids), the `verify-*.tmp.mjs` harness pattern (§7).

**Port-fidelity warnings — things that look wrong but are load-bearing (do not "simplify"):**
- Event ordering uses **DB row ids, never timestamps** (server/DB clock skew broke a watchdog once). Age checks that must use wall-time carry a deliberate ±1s tolerance (3.5s gates, not 5s).
- Idempotency across serverless invocations is done with **persisted marker events** (`skipped reason=retrigger`, `error reason=undelivered`) — two lambdas may run the same check concurrently.
- `saveScriptGraph` is **upsert-then-prune** (a failed save must never wipe a graph).
- The watchdog **must skip** injected rows with `meta.mode` ∈ {`model_side`,`briefed`,`resume`} — retriggering those double-speaks.
- Backchannel lexicon: real short answers ("Nope.", "yes") must advance; only channel checks + mid-speech acks hold. A word-count gate alone regresses the opening turn.
- Control URLs are stamped into injected-event `meta` because separate lambdas share no memory.

### 1.2 Table DDL (create in voizo-sandbox; staging first)

```sql
create table listener_handlers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  intent_key text not null unique,
  description text not null default '',
  response_template text not null default '',
  action_type text not null default 'answer'
    check (action_type in ('answer','send_sms','give_offer','end_call','ignore')),
  delivery text not null default 'reword' check (delivery in ('verbatim','reword')),
  group_name text not null default '',
  tags text[] not null default '{}',
  enabled boolean not null default true,
  priority int not null default 50,
  mode text not null default 'both' check (mode in ('tool','listener','both')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table listener_collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table listener_collection_handlers (
  collection_id uuid not null references listener_collections(id) on delete cascade,
  handler_id uuid not null references listener_handlers(id) on delete cascade,
  primary key (collection_id, handler_id)
);

create table listener_scripts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  collection_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table listener_script_nodes (
  id uuid primary key,                        -- client-generated; NOT default
  script_id uuid not null references listener_scripts(id) on delete cascade,
  type text not null,
  scenario_id uuid,
  label text not null default '',
  config jsonb not null default '{}'::jsonb,  -- connectors, statements, collectionId, waitSeconds…
  pos_x double precision not null default 0,
  pos_y double precision not null default 0,
  created_at timestamptz not null default now()
);

create table listener_script_edges (
  id uuid primary key,                        -- client-generated
  script_id uuid not null references listener_scripts(id) on delete cascade,
  source_node_id uuid not null,
  target_node_id uuid not null,
  condition jsonb not null default '{}'::jsonb, -- {kind:'intent'|'any'|'timeout', by, value, handle:'c:<uuid>'}
  label text not null default '',
  created_at timestamptz not null default now()
);

create table lab_call_events (
  id bigint generated always as identity primary key,  -- row id IS the ordering anchor
  call_id text not null,
  event_type text not null,   -- utterance|agent_said|classified|speculated|injected|skipped|error|sms|status
  role text,
  content text,
  intent_key text,
  confidence double precision,
  handler_id uuid,
  action_type text,
  utterance_at timestamptz,
  received_at timestamptz not null default now(),
  classified_at timestamptz,
  injected_at timestamptz,
  latency_ms int,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index idx_lab_call_events_call on lab_call_events(call_id, id);

create table lab_call_flow_state (
  call_id text primary key,
  script_id uuid,
  current_node_id uuid,
  variables jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()   -- optimistic-lock token
);

create table lab_settings (           -- builder-level defaults; per-campaign config lives on campaigns_v2
  id text primary key default 'default',
  lab_assistant_id text,
  short_prompt text,
  router_model text not null default 'gpt-4o-mini',
  confidence_threshold double precision not null default 0.6,
  injection_cooldown_ms int not null default 0,
  trigger_response boolean not null default true,
  server_url_override text,
  active_collection_id uuid,
  active_script_id uuid,
  updated_at timestamptz not null default now()
);
```

RLS: match the `campaigns_v2` precedent (permissive `for all using(true)`) initially — the builder UI queries these tables from the browser via the anon client, same isomorphic pattern as `lib/lab-db.ts`. Fold into Voizo's RLS Phase A later.

**Reference data:** copy the Playbook content (handlers/collections/scripts — a few hundred small rows) from the source DB. A ~30-line Node script with two Supabase clients (read anon from `mfnebrospbqhbrxfexie`, write service-role into voizo-sandbox, in FK order: handlers → collections → memberships → scripts → nodes → edges) does it; the source repo's `scripts/seed-connector-samples.mjs` shows the shapes. Skip `lab_call_events` / `lab_call_flow_state` history.

---

## 2. What changes in Voizo (and what explicitly does not)

### Non-goals — zero change for:
- Agent-mode campaigns (the entire current flow is the default; `agent_mode='assistant'`).
- Dialer (`src/lib/dialer.ts` `fireCall`), FreeSWITCH originate/status webhooks, chain-next, retry policy, call windows, suppression, SIP pool + concurrency gate, scheduler crons, SMS dispatch, QA judge, prompt versioning, ghost portal.

### The key architectural fit
Voizo already: dials PSTN → bridges into a **per-campaign VAPI assistant clone** over SIP; the clone carries the prompt; `server.url` is pinned at clone time (`cloneAssistant.ts:442-452`). The Script Engine also runs on a VAPI assistant — it just needs the clone configured differently. **So script campaigns keep `vapi_assistant_id`, keep the SIP slot, keep `fireCall` untouched.** No null-assistant branch is needed anywhere in the dial path (this supersedes the "leave vapi_assistant_id null" idea — the nullable column stays relevant only for eject/rebind, as today).

### 2.1 Schema migration (one file, additive)

```sql
alter table campaigns_v2
  add column agent_mode text not null default 'assistant'
    check (agent_mode in ('assistant','script')),
  add column script_id uuid,
  add column script_name text;
create index idx_campaigns_v2_script on campaigns_v2(script_id) where script_id is not null;
```

`system_prompt` stays and is repurposed for script campaigns as the **persona** section (who the agent is — today's "identity" scenario concept; operator-editable in the wizard).

### 2.2 Add Campaign wizard (Step 2)

`src/app/campaigns/v2/new/components/StepAgent.tsx` + `wizardState.ts`:
- A two-way selector at the top of Step 2: **"VAPI Agent" | "Script"** (`agentMode` in `WizardState`, default `assistant` — existing behavior untouched).
- Script branch: dropdown of `listener_scripts` (new `GET /api/scripts` reading the ported tables) + a "preflight" badge (run the builder's `preflight()` checks server-side — a script with blocking issues cannot be selected; the builder already enforces this on test runs), a persona textarea (pre-filled from the identity scenario or campaign default; saved to `system_prompt`), and the **voice picker** (reuse Voizo's existing voice mechanism / `KNOWN_VOICES`; script mode should *allow* explicit voice choice — persist to `voice_id` as today). Link "Edit in Script Builder →" to the ported builder page.
- `validateBeforeSubmit` (`wizardState.ts:743`): branch — script mode requires `scriptId` (not `vapiAssistantId`).
- `buildCreateInput`: pass `agentMode`, `scriptId`, `scriptName` through to `createCampaignV2`.

### 2.3 Launch path (`handleLaunch`, `page.tsx:386-440`)

Fixed script campaign: instead of plain `POST /api/vapi/clone-assistant`, call it with `{ mode:'script', scriptId, persona }` (or a sibling route). Inside `createClone`:
1. Clone from a **designated script-base assistant** (one base configured once with the transcriber and model provider settings; recommend cloning the same Val-lineage base used today) — SIP slot leasing, phone binding, metadata (`voizoClone` + `scriptEngine: true`) all as today.
2. Apply the **script composition** (ported from `configure-assistant`, refactored into `src/lib/scriptEngine/composeAssistant.ts`):
   - `model.messages[system]` = wait-phrase ban + persona (campaign `system_prompt`) + `LAB_OPERATING_RULES` + rules 8–9 (stage discipline, approved fillers, pacing) + `[Opening]` rule (when the Start box opening is `reword`) + `[STANDING ANSWERS]` + the **entry `[CURRENT STAGE]`** — all compiled from `script_id`.
   - `firstMessage` / `firstMessageMode` from the Start box (exact opening → literal `firstMessage`; reworded → model-generates; empty → VAPI default greeting).
   - `serverMessages`: `["tool-calls","transcript","status-update","speech-update","end-of-call-report"]` **with transcript partials enabled** (the engine's anticipation needs partials; note §6.3 on webhook volume).
   - `stopSpeakingPlan` (numWords 3, acknowledgement + channel-check phrases, interruption phrases), `startSpeakingPlan` (smart endpointing, 0.5s), `messagePlan` idle nudges (12s, the three content-neutral lines — the watchdog's noise filter knows these exact strings), Deepgram keyterm boosting (base keyterms + per-campaign terms, e.g. "free spins", "wagering").
   - `server.url` → **`/api/webhooks/vapi/script-call`** (new route, §2.4) with the same `VAPI_WEBHOOK_SECRET`. Voizo still owns webhook routing — the pin at `cloneAssistant.ts:442` simply points script clones at the script route. `VOIZO_SYSTEM_PREFIX` should NOT be prepended for script clones (the engine's rules supersede it; review its content and fold anything compliance-critical into the persona).
3. `snapshotCampaignPrompt` works unchanged and now versions the *composed* prompt — free auditability of script changes between spawns. (Recommend also stashing `{script_id, graph_sha}` into `prompt_versions.model_meta` for exact graph attribution.)
4. **Eject / re-bind:** re-bind re-runs steps 1–2 from `script_id` + persisted `system_prompt`/`voice_id` — same shape as `rebindCore.ts` today. Recurring children re-compose per spawn, picking up script edits between runs (document this as a feature: edit script → next child uses it).

### 2.4 The script-call webhook (the one real new integration point)

New route `src/app/api/webhooks/vapi/script-call/route.ts` (add to `middleware.ts` public prefixes; authenticate `x-vapi-secret` exactly like `end-of-call/route.ts:41-60`):
- `transcript` (partial + final), `speech-update`, `status-update`, `tool-calls` → the ported engine handler (the entire `app/api/lab/webhook/route.ts` logic, moved to `src/lib/scriptEngine/handleWebhook.ts`). Resolution of "which script is this call running?": look up `calls_v2` by `vapi_call_id`→ campaign → `script_id` (replaces the source repo's global `lab_settings.active_script_id`; keep a per-call cache row in `lab_call_flow_state.script_id`, which the engine already persists on first turn).
- `end-of-call-report` → **delegate to Voizo's existing processing**. Refactor the body of `end-of-call/route.ts` into `src/lib/webhooks/processEndOfCall.ts` and call it from both routes. Everything downstream (goal_reached, outcomes, opt-out suppression, Mobivate SMS, recording URL, QA) then works for script campaigns with zero duplication. The engine's own end-box hangups happen via control URL mid-call; the report still arrives and closes the loop.
- Voicemail auto-hangup: the script handler receives the same `transcript` events — reuse `maybeAutoHangupVoicemail` from the shared lib *before* engine processing for campaigns with `voicemail_autohangup`. The engine additionally has an authored `edge_machine_detected`-style pattern if operators want scripted voicemail behavior.
- **Call-id mapping caution:** the engine keys everything on VAPI's `call.id` from webhook messages (`lab_call_events.call_id`, `lab_call_flow_state.call_id`). Voizo's `calls_v2.vapi_call_id` is matched late (end-of-call, `route.ts:247-379`) because the SIP bridge doesn't know the VAPI call id at dial time. The engine doesn't need the mapping to run; it only needs it for the campaign→script lookup above. Mitigation order: (1) match by SIP-URI suffix + in-flight window like `end-of-call` does, at the *first* webhook message, then cache in `lab_call_flow_state`; (2) if ambiguous, fall back to "the one running script campaign on that slot". Concurrency is per-slot sequential, so this is deterministic in practice.

### 2.5 The clock (the one honest gap — read this)

The engine's sub-5s timing guarantees (delivery retrigger, Wait-box silence paths, reworded-goodbye hangups) are **event-driven**: they run whenever a webhook message or a poll tick gives them CPU. In the source app, attended test calls get a **1.2s browser poll** (`/api/lab/watch`). Unattended phone campaigns have no browser, so out of the box the clocks tick only on VAPI webhook events:
- During any speech (either side): plenty of events — full fidelity.
- During **total silence**: nothing until the 12s idle nudge fires speech events. Consequences: swallowed-delivery recovery worst-case ~13s (vs ~5s attended); Wait-box `waitSeconds` effectively quantized to idle cadence; reworded-goodbye hangups may lag a few seconds.

Options, in recommended order:
1. **Ship with idle-nudge cadence** (simplest; acceptable UX: the nudge itself covers the silence) and set expectations: Wait-box silence paths on phone campaigns fire at 12s+.
2. **Per-call ticker on existing infra**: Voizo's EC2 FreeSWITCH shim (or the originate-shim host) runs a 2s loop hitting `/api/lab/watch {callId}` for each in-flight script call (start on originate, stop on terminal status). ~30 requests/min per concurrent call; trivially cheap, restores full timing.
3. VAPI-side `messagePlan` tuning (shorter idle) — blunt, affects UX; not recommended.

Do 1 for the pilot, 2 for production hardening.

### 2.6 Observability

Port the run-dock's *data* contract: a campaign call detail page (Voizo already has call views) gains a "Script timeline" tab reading `lab_call_events` by `call_id` — transcript with reply-latency tags, listener classifications, observer verdicts (`armed stage … (observer: N covered, M owed)` rows), red `error reason=undelivered` events. This is the QA surface that made the engine debuggable; don't skip it. The QA judge can later consume turn-level events (expected-vs-heard) as structured evidence.

---

## 3. Delivery phases (for Voizo Claude)

**Phase 0 — Foundations (no user-visible change)**
- Run §1.2 DDL on staging voizo-sandbox; permissive RLS; copy reference data from the source DB.
- Env: `OPENAI_API_KEY` already present (QA judge) — confirm quota for the router (~1–3 calls/customer-turn, gpt-4o-mini class, 4s timeout). No new secrets needed (`VAPI_PRIVATE_KEY`, `VAPI_WEBHOOK_SECRET` exist).
- Port `lib/lab-*.ts` → `src/lib/scriptEngine/*` mechanically (path fixes only; swap `lib/supabase.ts` import for a browser-safe client + keep `supabaseAdmin` OUT of these files — they are isomorphic by design). Port the webhook handler to `src/lib/scriptEngine/handleWebhook.ts` + thin route; port `/api/lab/watch`.
- Port the test harness (§7) and get it green against a local dev server before any UI work. **This is the acceptance gate for Phase 0.**

**Phase 1 — Builder + Playbook pages**
- `src/app/scripts/` (list + builder page hosting `ScriptBuilder`), `src/app/playbook/` (OrganizerTable + CollectionsManager). Behind the existing Basic Auth automatically. Keep the source styling initially (dark Tailwind classes port fine under Tailwind v4); shadcn-harmonization is polish, not scope.
- Builder test runs (web calls + the 1.2s poll + dock) work as-is once `configure-assistant` composition is wired to a designated test assistant — this gives Voizo an attended QA rig identical to the source app's.

**Phase 2 — Campaign integration**
- §2.1 migration; §2.2 wizard; §2.3 clone composition; §2.4 script-call webhook + `processEndOfCall` refactor; middleware public prefix.
- Ghost Portal + `is_test` campaigns are the perfect pilot channel: run script campaigns against internal numbers before any production audience.

**Phase 3 — Hardening**
- Clock option 2 (per-call ticker) if Wait-box timing matters for the campaigns being built.
- Call-detail "Script timeline" tab (§2.6).
- Recurring/realtime script campaigns (composition already re-runs per spawn — mostly a testing task).
- Region audit: the engine does many small DB round-trips per turn; co-locate Vercel functions with the voizo-sandbox Supabase region (the source app pins `regions` in `vercel.json` for this exact reason — 15s injections dropped to ~1.5s).

---

## 4. Known open items in the engine (inherited; fix before/while porting)

From the 2026-07-09 live QA sweep (10 calls, all documented in the source repo's KANBAN/PMS):
1. **Navigation debounce (~1s)** — several real replies within seconds each advance one hop and can outrun delivery ("skipped box X"). Design agreed: debounce the flow walk; reply latency is unaffected (the model answers natively regardless).
2. **Member-intent vs connector-matcher routing gap** — a collection *member* classification (e.g. `val_do_not_call_again`) doesn't satisfy a *matcher* condition ("player doesn't want SMS/calls"), so catch-alls can eat it. Worst case observed: **"do not call me again" did not end the call** — for Voizo this is compliance-critical (suppression list). Fix direction: connectors targeting a collection implicitly own that collection's member intents; and/or router returns the matcher as a secondary intent. **Do not launch unattended script campaigns before this one.** (Voizo's own opt-out detection at end-of-call still runs as a backstop — it suppresses the number even when the call didn't end promptly.)
3. **Noise-lexicon additions** — "cannot hear you" variants; Deepgram keyterms per campaign ("free spins" was transcribed "preach spins").
4. Script-authoring lint (nice-to-have): warn when an `ANY` catch-all points straight at an End box (the "hung up on a question" trap) — the builder's preflight is the natural home.

---

## 5. Contract summary for the engine inside Voizo

- **Reads/writes** the 8 §1.2 tables via the anon client (browser + server) — no service-role dependency.
- **Receives** VAPI webhooks (transcript incl. partials, speech-update, status-update, tool-calls, end-of-call-report) at the script-call route; **sends** control-URL commands (`say`, `add-message` system notes ±trigger, `end-call`) — control URL comes from webhook `call.monitor.controlUrl` and is stamped into event `meta` for cross-lambda reuse.
- **Calls** OpenAI chat-completions (router) with `OPENAI_API_KEY`; honors `OPENAI_BASE_URL` override (harness).
- **Requires** the composed prompt + serverMessages + speech plans of §2.3 on the assistant — a script campaign whose clone lacks these degrades to a normal VAPI agent with no script.
- **Emits** `lab_call_events` (the audit log powering QA UIs) and `lab_call_flow_state` (per-call position; safe to prune rows older than ~30 days along with events).

## 6. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Webhook volume (transcript partials) | +Vercel invocations per call (~1–3/s while customer speaks) | Partials handler is cheap (speculation only); measure on ghost pilot; can disable partials at cost of +~1s reply latency |
| Router cost/latency | 1–3 gpt-4o-mini calls per customer turn | Already tiered + 4s-capped; quick-words route common replies for free |
| Two webhook handlers drift | end-of-call logic duplicated | `processEndOfCall` shared-lib refactor (§2.4) — single source |
| Silence-window timing unattended | Wait/silence features lag to ~12s | §2.5; pilot with option 1, harden with option 2 |
| DNC gap (§4.2) | Compliance | Fix before unattended launch; end-of-call opt-out suppression is the backstop |
| Region latency | Multi-second turns | Pin functions next to voizo-sandbox region (§3 Phase 3) |
| Prompt prefix conflict | `VOIZO_SYSTEM_PREFIX` contradicting engine rules | Skip prefix on script clones; fold compliance lines into persona |

## 7. Test protocol (port this discipline)

The source repo verifies every engine change against a **local harness**: a mock OpenAI router (canned intents keyed on magic phrases), a VAPI control-URL stub capturing `say`/`add-message`/`end-call`, and a dev server driven by synthetic webhook posts — 42 assertions currently cover routing, arming, menus (members/else/statements/marks/debts), the backchannel gate, the interruption arbiter, watchdog idempotency, wait-box silence paths, and goodbye handling. Port `verify-brief` (ask for the latest copy; the pattern is: temp rows with `tmp_` keys → drive webhooks → assert events + control messages → cleanup in `finally`). Adapt to vitest if preferred, but keep the end-to-end shape — unit tests alone missed every serverless bug this engine ever had. Ghost-portal `is_test` campaigns are the staging equivalent for real PSTN calls.

## 8. Handoff package

- **This document**: `docs/VOIZO-SCRIPT-ENGINE-MIGRATION-PLAN.md` in the source repo.
- **Source repo**: https://github.com/Optinet-Solutions-Automation/vapi-voiceagent-test (main branch; KANBAN.md = change history with rationale; docs/listener-lab-manual.html = user manual).
- **Source DB** (reference data to copy): `https://mfnebrospbqhbrxfexie.supabase.co`, anon key in `lib/supabase.ts` (read-only is sufficient for the copy script).
- **Live source app** (see the engine working; run attended test calls): https://vapi-voiceagent-test.vercel.app — Script Builder → pick a script → Run.
- Questions → Chris; engine-side fixes (§4) can land in the source repo and be re-ported, or be fixed directly in Voizo post-port (source repo then becomes the R&D bench).
