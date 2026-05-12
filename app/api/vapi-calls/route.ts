import { NextResponse } from "next/server";

const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY!;
const VAPI_BASE = "https://api.vapi.ai";

export async function GET(request: Request) {
  if (!VAPI_PRIVATE_KEY) {
    return NextResponse.json(
      { error: "VAPI_PRIVATE_KEY not configured. Add it to .env.local" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") ?? "100";
  const assistantId = searchParams.get("assistantId");

  const params = new URLSearchParams({ limit });
  if (assistantId) params.set("assistantId", assistantId);

  const [callsRes, assistantsRes] = await Promise.all([
    fetch(`${VAPI_BASE}/call?${params.toString()}`, {
      headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}` },
      cache: "no-store",
    }),
    fetch(`${VAPI_BASE}/assistant`, {
      headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}` },
      cache: "no-store",
    }),
  ]);

  if (!callsRes.ok) {
    const text = await callsRes.text();
    return NextResponse.json({ error: text }, { status: callsRes.status });
  }

  const data = await callsRes.json();
  const calls = Array.isArray(data) ? data : [];

  const assistantNameById = new Map<string, string>();
  if (assistantsRes.ok) {
    const assistants = await assistantsRes.json();
    if (Array.isArray(assistants)) {
      for (const a of assistants) {
        if (a?.id && a?.name) assistantNameById.set(a.id, a.name);
      }
    }
  }

  const summarized = calls.map((c: any) => {
    const startedAt = c.startedAt ?? c.createdAt ?? null;
    const endedAt = c.endedAt ?? null;
    let durationSeconds: number | null = null;
    if (startedAt && endedAt) {
      const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
      if (Number.isFinite(ms) && ms >= 0) durationSeconds = Math.round(ms / 1000);
    }
    const aId = c.assistantId ?? c.assistant?.id ?? null;
    const aName = c.assistant?.name ?? (aId ? assistantNameById.get(aId) ?? null : null);
    return {
      id: c.id,
      type: c.type ?? null,
      status: c.status ?? null,
      endedReason: c.endedReason ?? null,
      assistantId: aId,
      assistantName: aName,
      phoneNumber: c.customer?.number ?? c.phoneNumber?.number ?? null,
      startedAt,
      endedAt,
      durationSeconds,
      cost: typeof c.cost === "number" ? c.cost : null,
      hasRecording: Boolean(c.artifact?.recordingUrl ?? c.recordingUrl),
    };
  });

  return NextResponse.json(summarized);
}
