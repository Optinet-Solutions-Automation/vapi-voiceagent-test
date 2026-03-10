export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
  try {
    const { transcript } = await req.json();

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json({ error: "Missing transcript" }, { status: 400 });
    }

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a call quality analyst. Be direct and concise — no filler, no fluff. Analyze the call transcript with these sections (use bullet points, keep each section to 1-3 lines max):

1. **Summary** — One sentence.
2. **Classification** — GOOD or BAD. One sentence why.
3. **Key Topics** — Bullet list.
4. **Customer Sentiment** — One sentence.
5. **Agent Performance** — One sentence with score /10.
6. **Issues** — Bullet list. Say "None" if clean.
7. **Action Items** — Bullet list of specific fixes.`,
        },
        {
          role: "user",
          content: transcript,
        },
      ],
      max_tokens: 1500,
    });

    const analysis = completion.choices[0]?.message?.content ?? "No analysis generated.";
    const isGood = /\bGOOD\b/i.test(analysis.split("Classification")[1]?.slice(0, 200) ?? "");
    const isBad = /\bBAD\b/i.test(analysis.split("Classification")[1]?.slice(0, 200) ?? "");
    const classification = isGood ? "good" : isBad ? "bad" : "unclassified";

    return NextResponse.json({ analysis, classification });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Analysis failed" },
      { status: 500 }
    );
  }
}
