import { NextResponse } from "next/server";

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

  const res = await fetch(`https://api.vapi.ai/call/${callId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `Vapi API returned ${res.status}` },
      { status: res.status }
    );
  }

  const data = await res.json();

  return NextResponse.json({
    recordingUrl: data.artifact?.recordingUrl ?? data.recordingUrl ?? null,
    stereoRecordingUrl: data.artifact?.stereoRecordingUrl ?? data.stereoRecordingUrl ?? null,
  });
}
