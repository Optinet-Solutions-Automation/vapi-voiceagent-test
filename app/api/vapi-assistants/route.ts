import { NextResponse } from "next/server";

const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY!;
const VAPI_BASE = "https://api.vapi.ai";

export async function GET() {
  const res = await fetch(`${VAPI_BASE}/assistant`, {
    headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: res.status });
  }
  const data = await res.json();
  // Return only the fields the client needs
  const assistants = Array.isArray(data)
    ? data.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name }))
    : [];
  return NextResponse.json(assistants);
}
