import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/agent-configs — list all agent configs (id + name only, no password hash)
export async function GET() {
  const { data, error } = await supabase
    .from("agent_configs")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
