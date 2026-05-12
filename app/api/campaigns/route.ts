import { NextResponse } from "next/server";
import { campaignsConfigured, getCampaignsSupabase } from "@/lib/campaigns-supabase";

export async function GET() {
  if (!campaignsConfigured) {
    return NextResponse.json(
      { error: "Campaigns DB not configured. Set CAMPAIGNS_SUPABASE_URL and CAMPAIGNS_SUPABASE_SERVICE_KEY in .env.local." },
      { status: 500 }
    );
  }

  const sb = getCampaignsSupabase();

  const [campaignsRes, callsRes] = await Promise.all([
    sb
      .from("campaigns_v2")
      .select("id, name, status, vapi_assistant_id, vapi_assistant_name, created_at")
      .order("created_at", { ascending: false }),
    sb
      .from("calls_v2")
      .select("campaign_id, status, duration_seconds, goal_reached"),
  ]);

  if (campaignsRes.error) {
    return NextResponse.json({ error: campaignsRes.error.message }, { status: 500 });
  }

  const campaigns = campaignsRes.data ?? [];
  const calls = callsRes.data ?? [];

  type Bucket = {
    total: number;
    completed: number;
    failed: number;
    initiated: number;
    goalsReached: number;
    durationSum: number;
    durationCount: number;
  };
  const stats = new Map<string, Bucket>();
  for (const c of calls) {
    const id: string | null = (c as any).campaign_id ?? null;
    if (!id) continue;
    const b = stats.get(id) ?? {
      total: 0, completed: 0, failed: 0, initiated: 0,
      goalsReached: 0, durationSum: 0, durationCount: 0,
    };
    b.total += 1;
    const status = (c as any).status;
    if (status === "completed") b.completed += 1;
    else if (status === "failed") b.failed += 1;
    else if (status === "initiated") b.initiated += 1;
    if ((c as any).goal_reached === true) b.goalsReached += 1;
    const d = (c as any).duration_seconds;
    if (typeof d === "number" && d > 0) {
      b.durationSum += d;
      b.durationCount += 1;
    }
    stats.set(id, b);
  }

  const enriched = campaigns.map((c: any) => {
    const b = stats.get(c.id);
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      vapiAssistantId: c.vapi_assistant_id,
      vapiAssistantName: c.vapi_assistant_name,
      createdAt: c.created_at,
      totalCalls: b?.total ?? 0,
      completedCalls: b?.completed ?? 0,
      failedCalls: b?.failed ?? 0,
      initiatedCalls: b?.initiated ?? 0,
      goalsReached: b?.goalsReached ?? 0,
      avgDurationSeconds: b && b.durationCount > 0 ? Math.round(b.durationSum / b.durationCount) : null,
    };
  });

  return NextResponse.json(enriched);
}
