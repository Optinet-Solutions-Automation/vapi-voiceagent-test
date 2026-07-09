# Vapi Voice Agent Training Tool — Kanban Board

> Local mirror of the PMS board. **Rule:** when we start/finish a task here, we
> also move it in the PMS tool. Move order: **Backlog → To Do → In Progress →
> Review/QA → Done** (use **Blocked** if stuck).
>
> - **PMS project:** [Vapi Voice Agent Training Tool](https://pms-nu-eight.vercel.app/projects/cmrd42cp6000004jobwzyi37k)
> - **Repo:** https://github.com/Optinet-Solutions-Automation/vapi-voiceagent-test
> - **Live app:** https://vapi-voiceagent-test.vercel.app
> - **Default assignee:** Christian Albea
> - **Docs:** [VERSION.md](VERSION.md) — full change history per feature
> - Last synced: 2026-07-09 (backlog cleared per Chris; weekend Jul 4-5 work added)

## How we keep this in sync with PMS
1. Pick a task → move its line to **In Progress** here, and move it in PMS.
2. When code is ready for check → move to **Review/QA** in both.
3. When approved → move to **Done** in both, check the box.
4. If blocked → move to **Blocked** in both and note why.
5. New work → add to **Backlog** here *and* create it in PMS (assign Christian).

PMS column IDs (for API moves via `PATCH /api/tasks/{taskId}/move`, auth
`Authorization: Bearer $PMS_TOKEN` from `.env.local`):
`Backlog` `cmrd42cqc000104jo8cvqaw64` · `To Do` `cmrd42cqc000204jokvqodvui` ·
`In Progress` `cmrd42cqc000304jo21p67hqx` · `Review/QA` `cmrd42cqc000404job2r7064e` ·
`Blocked` `cmrd42cqc000504jogfu27pan` · `Done` `cmrd42cqc000604jor7xjkbss`

Create tasks: `POST /api/projects/cmrd42cp6000004jobwzyi37k/tasks`
`{ title, description, columnId, priority: LOW|MEDIUM|HIGH|URGENT, assigneeIds }`

---

## 📋 Backlog
_(empty — cleared 2026-07-09)_

> Parking lot (ideas NOT on the PMS board yet — promote when ready):
> Twilio real SMS · Observer Layer 2 (summary/mood/goal) · Phase 3 one-campaign-one-agent ·
> Phase 4 CRM palette · Phase 5 personalization/audience

## 🟦 To Do
_(empty)_

## 🟠 In Progress
_(empty)_

## 🟣 Review/QA
- [ ] **Brief-ahead runtime: stage menus answered natively by VAPI** · `URGENT` · `cmrdb2nds000004l4y9rfqp6k` — _Jul 9; commit 9c32c34; awaiting Chris's live test call — rollback is one `git revert`_

## 🔴 Blocked
_(empty)_

## ✅ Done
- [x] **Duplicate workflow button** · `MEDIUM` · `cmrdgo2a2000004joss5rgpzb` — _Jul 9; one-click deep copy of a script (boxes, arrows, connector wiring) opening as "(copy)"_
- [x] **Watchdog real clock: run poll ticks /api/lab/watch every 1.2s** · `HIGH` · `cmrd9ndfh000004lexnyrr3ij` — _Jul 9; silent-briefing recovery 16-19s → ~4-6s; rule 8 outlaws silence after a supplied step_
- [x] **Transcript reply-latency tags** · `MEDIUM` · `cmrd8lfuz000h04lhlyd8xstx` — _Jul 9; each agent line shows the seconds the customer waited (utterance → speech start)_
- [x] **Live-call QA: silent briefings, guidance recital, router spike** · `HIGH` · `cmrd7y1vy000004lipz4ndjyu` — _Jul 9; watchdog now event-driven (serverless-proof), stage guidance framed INTERNAL, router capped 4s+retry_
- [x] **Multi-intent router + anticipatory listener + analyzed interruptions** · `HIGH` · `cmrd52zkx000604kvkjq9cki2` — _Jul 4-5_
- [x] **One response per turn + speaking lock + skip-ahead** · `HIGH` · `cmrd54z1a001r04joei51tyua` — _Jul 4-5_
- [x] **Filler discipline v1: instant, moment-matched, from a tiny set** · `MEDIUM` · `cmrd54zfd001t04jo3oant46b` — _Jul 4-5_
- [x] **Composed prompt architecture + one-command campaign switching** · `MEDIUM` · `cmrd54zjg001v04johxqzgte2` — _Jul 4-5_
- [x] **Victor v2 campaign as data + platform rules** · `HIGH` · `cmrd4liva000h04joesmyhwgb`
- [x] **Script Builder save integrity: uuid arrow ids, upsert-then-prune** · `HIGH` · `cmrd4lj6i000j04jo4ovf5tsh`
- [x] **Serverless fixes: self-covered skip + persisted speculation** · `HIGH` · `cmrd4ljcn000l04jos5psmcnl`
- [x] **Latency: Vercel functions pinned to Seoul next to Supabase** · `HIGH` · `cmrd4ljgi000n04joo37ha1na` — _~15s injections → 1.3–2.6s_
- [x] **Reply-connector redesign: routing lives on the boxes** · `HIGH` · `cmrd4ljli000p04jo2eh3g1dk` — _If/Else & Loop retired; no default path_
- [x] **Connector rules as plain text; matchers stay out of collections** · `MEDIUM` · `cmrd4ljpl000r04joa90i4xlx`
- [x] **Catch-all connectors + primary-intent routing** · `HIGH` · `cmrd4ljtn000t04jo09aekesd`
- [x] **Run mode: built-in QA gate + live canvas monitor** · `HIGH` · `cmrd4ljxj000v04jou53hnswe`
- [x] **Live-run dock: transcript / listener / observer** · `MEDIUM` · `cmrd4lk1q000x04jo65mvrspz`
- [x] **Run history + replay** · `MEDIUM` · `cmrd4lk5k000z04jod2m2b306`
- [x] **Unified replies: side-answer merging on routed turns** · `MEDIUM` · `cmrd4lk94001104jo5odo4au1`
- [x] **Call quality: anti-repeat ledger + Deepgram keyterm boosting** · `HIGH` · `cmrd4lkcp001304jo0a1xwxn6`
- [x] **Observer navigation: expectation priors + waiting-for display** · `MEDIUM` · `cmrd4lkgy001504jodsc2b6ic`
- [x] **Strict script mode: rules 8–9, approved fillers only** · `HIGH` · `cmrd4lkki001704jod7zk6241`
- [x] **Collection Else ladder + delivery choice everywhere** · `MEDIUM` · `cmrd4lko7001904jozfl3753q`
- [x] **Additional statements + hover toolbar + canvas capsules** · `MEDIUM` · `cmrd4lkrw001b04jo7uq6mj9q`
- [x] **Delivery watchdog: swallowed lines can no longer vanish** · `HIGH` · `cmrd4lkw7001d04jojltsiatn`
- [x] **Latency: three-tier classification (instant / fast / full)** · `HIGH` · `cmrd4lkzr001f04jo3l0hdpun`
- [x] **Legacy era removed + UX batch** · `MEDIUM` · `cmrd4ll3e001h04jom7hwcqnj` — _undo/redo, dirty-save flow, −400 lines_
- [x] **Builder config drawer + voice-agent picker** · `LOW` · `cmrd4ll7d001j04jo8z6kkfqk`
- [x] **Sample scripts v2 (basic + advanced) with the full feature set** · `MEDIUM` · `cmrd4llaw001l04jo8rjkzuqm`
