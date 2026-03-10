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
          content: `You are a call quality analyst. Analyze the following call transcript and provide a structured analysis with these sections:

1. **Summary** - Brief overview of the call
2. **Classification** - Is this a GOOD or BAD call? Explain why.
3. **Key Topics** - Main topics discussed
4. **Customer Sentiment** - How did the customer feel during the call?
5. **Agent Performance** - How well did the agent handle the call?
6. **Issues Found** - Any problems, missed opportunities, or compliance issues
7. **Recommendations** - Suggestions for improvement

Be concise but thorough.`,
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
