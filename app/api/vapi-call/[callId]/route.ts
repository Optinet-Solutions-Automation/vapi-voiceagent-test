import { NextResponse } from "next/server";

const VAPI_BASE = "https://api.vapi.ai";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params;
  const apiKey = process.env.VAPI_PRIVATE_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "VAPI_PRIVATE_KEY not configured. Add it to .env.local" },
      { status: 500 }
    );
  }

  const res = await fetch(`${VAPI_BASE}/call/${callId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Vapi API returned ${res.status}: ${text}` },
      { status: res.status }
    );
  }

  const data = await res.json();

  const messages = Array.isArray(data.artifact?.messages)
    ? data.artifact.messages
    : Array.isArray(data.messages)
    ? data.messages
    : [];

  const transcript = messages
    .filter((m: any) => (m.role === "user" || m.role === "assistant" || m.role === "bot") && (m.message || m.content))
    .map((m: any) => ({
      role: m.role === "user" ? "user" : "agent",
      content: m.message ?? m.content ?? "",
      time: m.time ?? null,
      secondsFromStart: typeof m.secondsFromStart === "number" ? m.secondsFromStart : null,
    }));

  const startedAt = data.startedAt ?? data.createdAt ?? null;
  const endedAt = data.endedAt ?? null;
  let durationSeconds: number | null = null;
  if (startedAt && endedAt) {
    const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    if (Number.isFinite(ms) && ms >= 0) durationSeconds = Math.round(ms / 1000);
  }

  return NextResponse.json({
    id: data.id,
    type: data.type ?? null,
    status: data.status ?? null,
    endedReason: data.endedReason ?? null,
    assistantId: data.assistantId ?? data.assistant?.id ?? null,
    assistantName: data.assistant?.name ?? null,
    phoneNumber: data.customer?.number ?? data.phoneNumber?.number ?? null,
    startedAt,
    endedAt,
    durationSeconds,
    cost: typeof data.cost === "number" ? data.cost : null,
    summary: data.analysis?.summary ?? data.summary ?? null,
    transcriptText: data.artifact?.transcript ?? data.transcript ?? null,
    transcript,
    recordingUrl: data.artifact?.recordingUrl ?? data.recordingUrl ?? null,
    stereoRecordingUrl: data.artifact?.stereoRecordingUrl ?? data.stereoRecordingUrl ?? null,
  });
}
