import { NextResponse } from "next/server";
import { campaignsConfigured, getCampaignsSupabase } from "@/lib/campaigns-supabase";

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
  const campaignId = searchParams.get("campaignId");

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

  // Join in campaign info from the voizo-sandbox project (calls_v2 -> campaigns_v2).
  const campaignByCallId = new Map<string, { id: string; name: string }>();
  if (campaignsConfigured) {
    try {
      const sb = getCampaignsSupabase();
      const vapiIds = calls.map((c: any) => c.id).filter(Boolean);
      if (vapiIds.length > 0) {
        const { data: linkRows } = await sb
          .from("calls_v2")
          .select("vapi_call_id, campaign_id")
          .in("vapi_call_id", vapiIds);
        const links = Array.isArray(linkRows) ? linkRows : [];
        const campaignIds = Array.from(new Set(links.map((r: any) => r.campaign_id).filter(Boolean)));
        const campaignNameById = new Map<string, string>();
        if (campaignIds.length > 0) {
          const { data: campRows } = await sb
            .from("campaigns_v2")
            .select("id, name")
            .in("id", campaignIds);
          for (const c of campRows ?? []) {
            if (c?.id && c?.name) campaignNameById.set(c.id, c.name);
          }
        }
        for (const r of links) {
          if (!r?.vapi_call_id || !r?.campaign_id) continue;
          const name = campaignNameById.get(r.campaign_id);
          if (name) campaignByCallId.set(r.vapi_call_id, { id: r.campaign_id, name });
        }
      }
    } catch (e) {
      console.error("[vapi-calls] campaign join failed:", e);
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
    const camp = campaignByCallId.get(c.id) ?? null;
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
      campaignId: camp?.id ?? null,
      campaignName: camp?.name ?? null,
    };
  });

  const filtered = campaignId
    ? summarized.filter((c) => c.campaignId === campaignId)
    : summarized;

  return NextResponse.json(filtered);
}
