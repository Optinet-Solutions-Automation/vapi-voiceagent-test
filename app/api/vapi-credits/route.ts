import { NextResponse } from "next/server";

const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY!;
const VAPI_BASE = "https://api.vapi.ai";

async function tryFetch(path: string) {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export async function GET() {
  // Try known VAPI paths for account/billing info
  const data =
    (await tryFetch("/account")) ??
    (await tryFetch("/org")) ??
    (await tryFetch("/me"));

  if (!data) {
    return NextResponse.json({ credits: null, error: "no billing endpoint found" });
  }

  // Normalise across possible field names
  const credits: number | null =
    data?.balance ??
    data?.credits ??
    data?.remainingCredits ??
    data?.creditBalance ??
    null;

  return NextResponse.json({ credits, raw: data });
}
