import { NextResponse } from "next/server";
import { campaignsConfigured, getCampaignsSupabase } from "@/lib/campaigns-supabase";

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

  const [res, assistantsRes] = await Promise.all([
    fetch(`${VAPI_BASE}/call/${callId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    }),
    fetch(`${VAPI_BASE}/assistant`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    }),
  ]);

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Vapi API returned ${res.status}: ${text}` },
      { status: res.status }
    );
  }

  const data = await res.json();

  let resolvedAssistantName: string | null = data.assistant?.name ?? null;
  const resolvedAssistantId: string | null = data.assistantId ?? data.assistant?.id ?? null;
  if (!resolvedAssistantName && resolvedAssistantId && assistantsRes.ok) {
    const assistants = await assistantsRes.json();
    if (Array.isArray(assistants)) {
      const match = assistants.find((a: any) => a?.id === resolvedAssistantId);
      if (match?.name) resolvedAssistantName = match.name;
    }
  }

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

  let campaignId: string | null = null;
  let campaignName: string | null = null;
  if (campaignsConfigured) {
    try {
      const sb = getCampaignsSupabase();
      const { data: link } = await sb
        .from("calls_v2")
        .select("campaign_id")
        .eq("vapi_call_id", callId)
        .maybeSingle();
      if (link?.campaign_id) {
        campaignId = link.campaign_id;
        const { data: camp } = await sb
          .from("campaigns_v2")
          .select("name")
          .eq("id", link.campaign_id)
          .maybeSingle();
        campaignName = camp?.name ?? null;
      }
    } catch (e) {
      console.error("[vapi-call detail] campaign join failed:", e);
    }
  }

  return NextResponse.json({
    id: data.id,
    type: data.type ?? null,
    status: data.status ?? null,
    endedReason: data.endedReason ?? null,
    assistantId: resolvedAssistantId,
    assistantName: resolvedAssistantName,
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
    campaignId,
    campaignName,
  });
}
