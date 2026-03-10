export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
  try {
    const { question, transcripts } = await req.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }

    if (!Array.isArray(transcripts) || transcripts.length === 0) {
      return NextResponse.json({ error: "No transcripts provided" }, { status: 400 });
    }

    // Build context from all transcripts (truncate each to keep within limits)
    const maxPerTranscript = Math.floor(80000 / transcripts.length);
    const context = transcripts
      .map(
        (t: { title: string; content: string; classification: string }, i: number) =>
          `--- Transcript ${i + 1}: "${t.title}" (${t.classification}) ---\n${t.content.slice(0, maxPerTranscript)}`
      )
      .join("\n\n");

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a call analytics assistant. You have ${transcripts.length} call transcripts. Answer directly — be concise, use bullet points, no filler. Cite transcript titles when relevant. Focus on actionable insights.`,
        },
        {
          role: "user",
          content: `Here are the call transcripts:\n\n${context}\n\n---\n\nQuestion: ${question}`,
        },
      ],
      max_tokens: 2000,
    });

    const answer = completion.choices[0]?.message?.content ?? "No answer generated.";

    return NextResponse.json({ answer });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to process question" },
      { status: 500 }
    );
  }
}
