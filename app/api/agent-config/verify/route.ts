import { NextResponse } from "next/server";
import { hashPassword } from "../route";
import { supabase } from "@/lib/supabase";

// POST /api/agent-config/verify — verify owner password
export async function POST(req: Request) {
  const { assistantId, password } = await req.json();

  const { data } = await supabase
    .from("agent_configs")
    .select("password_hash")
    .eq("id", assistantId)
    .maybeSingle();

  if (!data?.password_hash) {
    // No password set — anyone can be owner
    return NextResponse.json({ valid: true });
  }

  const valid = hashPassword(password ?? "", assistantId) === data.password_hash;
  return NextResponse.json({ valid });
}
