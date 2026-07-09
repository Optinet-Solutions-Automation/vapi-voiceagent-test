// Server-only: the delivery watchdog, shared by every invocation that gets
// CPU during a call. Serverless freezes background timers (live calls proved
// after()+setTimeout never runs on Vercel), so the check is invoked from
// wherever a live request exists: webhook messages (assistant speech-updates,
// status updates) and the Script Builder's 1.2s run poll via /api/lab/watch —
// during TOTAL silence the webhook goes quiet too, and the poll is the only
// reliable clock. Idempotent across concurrent invocations via persisted
// retrigger/error marker events.
import {
  insertLabEvent,
  lastFlowInjection,
  hasNewerUtterance,
  agentSaidAfter,
  assistantSpeaking,
  watchdogStateAfter,
} from "./lab-db";
import { getControlUrl, injectStaffNote, endCall } from "./lab-control";

// The idle nudges configure-assistant installs — spoken by VAPI itself, so
// they must never count as the briefed line having been delivered.
const IDLE_NUDGES = ["Take your time — I'm still here.", "Are you still with me?", "Can you hear me okay?"];

/** The model sometimes answers a triggered briefing with its filler ALONE
 *  ("Uh-huh." … silence) — it "waits" for a line that already arrived — or
 *  the trigger races the filler and gets swallowed. Verify substantial
 *  speech followed the newest injection; re-trigger once with blunter
 *  wording; if even that stays silent, log a red error so an undelivered
 *  line can never pass QA unnoticed. Also owns the reworded-goodbye hangup
 *  (its setTimeout has the same serverless-freeze bug). */
export async function checkDelivery(callId: string, controlUrlHint: string | null): Promise<void> {
  try {
    const inj = await lastFlowInjection(callId);
    if (!inj || !inj.content || !inj.meta.flow) return;
    if (inj.meta.mode === "disabled_skipped") return;
    const nodeType = inj.meta.nodeType as string | undefined;
    const age = Date.now() - new Date(inj.createdAt).getTime();
    // Prefer the caller's hint, else the control url stamped on the
    // injection row — the poll route has no in-memory cache to fall back on.
    const hint = controlUrlHint ?? ((inj.meta.controlUrl as string | undefined) || null);
    // Goodbyes end the call themselves — once the goodbye was voiced (or
    // waiting stopped making sense), hang up.
    if (nodeType === "end") {
      const voiced = await agentSaidAfter(callId, inj.id, 10, IDLE_NUDGES);
      const overdue = inj.meta.rewordGoodbye ? (voiced && age > 7000) || age > 15000 : !voiced && age > 8000;
      if (overdue && !(await assistantSpeaking(callId))) {
        const controlUrl = await getControlUrl(callId, hint);
        if (controlUrl) await endCall(controlUrl).catch(() => {});
      }
      return;
    }
    if (nodeType === "transfer") return;
    // 3.5s, not 5: `age` compares a DB timestamp against this machine's
    // clock, and ~1s of skew once made a 5s check measure 4.4s and skip.
    // A normal delivery starts speaking well inside 3.5s, and the speech
    // guards above stand down for anything already in flight.
    if (age < 3500 || age > 60000) return;
    if (await hasNewerUtterance(callId, inj.id)) return; // customer moved on — the new turn owns delivery
    if (await agentSaidAfter(callId, inj.id, 20, IDLE_NUDGES)) return; // substantial non-idle speech = delivered
    if (await assistantSpeaking(callId)) return; // mid-speech — the next check re-verifies
    const wd = await watchdogStateAfter(callId, inj.id);
    if (wd.errored) return;
    if (wd.retriggerAt) {
      // Same skew tolerance as the age gate above.
      if (Date.now() - new Date(wd.retriggerAt).getTime() < 4000) return;
      await insertLabEvent({
        call_id: callId,
        event_type: "error",
        content: "line never voiced — briefing and retrigger both produced no speech",
        meta: { flow: true, reason: "undelivered" },
      }).catch(() => {});
      return;
    }
    const controlUrl = await getControlUrl(callId, hint);
    if (!controlUrl) return;
    // Marker first: it is the idempotency lock other invocations check.
    await insertLabEvent({
      call_id: callId,
      event_type: "skipped",
      content: "briefing produced no speech — re-triggering once",
      meta: { flow: true, reason: "retrigger" },
    }).catch(() => {});
    await injectStaffNote(
      controlUrl,
      `You paused after your filler, but the supplied step is still UNDELIVERED — speak it NOW, nothing else (if it's written as an instruction, say what it asks for; never read instruction wording aloud): ${inj.content}`,
      true
    );
  } catch {
    /* best effort */
  }
}
