import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabase } from "@/lib/supabase";

export function hashPassword(password: string, assistantId: string): string {
  return createHash("sha256").update(password + assistantId).digest("hex");
}

// GET /api/agent-config?id=assistantId — check if password is set
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data } = await supabase
    .from("agent_configs")
    .select("id, name, password_hash")
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ has_password: !!(data?.password_hash) });
}

// POST /api/agent-config — set or update password
export async function POST(req: Request) {
  const { assistantId, assistantName, password, currentPassword } = await req.json();

  if (!assistantId || !assistantName) {
    return NextResponse.json({ error: "assistantId and assistantName required" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("agent_configs")
    .select("password_hash")
    .eq("id", assistantId)
    .maybeSingle();

  // If already has a password, current password must be verified first
  if (existing?.password_hash) {
    if (!currentPassword) {
      return NextResponse.json({ error: "current_password required to change password" }, { status: 403 });
    }
    if (hashPassword(currentPassword, assistantId) !== existing.password_hash) {
      return NextResponse.json({ error: "Incorrect current password" }, { status: 403 });
    }
  }

  const password_hash = password ? hashPassword(password, assistantId) : null;

  const { error } = await supabase
    .from("agent_configs")
    .upsert({ id: assistantId, name: assistantName, password_hash });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
