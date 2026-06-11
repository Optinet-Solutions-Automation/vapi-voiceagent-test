// Server-only: the organizer's router LLM. Classifies a caller utterance into
// one of the enabled handler intents (or "none").
import OpenAI from "openai";
import type { ListenerHandler } from "./database.types";

export type Classification = {
  intent: string;
  confidence: number;
  raw?: string;
};

export async function classifyUtterance(
  utterance: string,
  recentTurns: string[],
  handlers: ListenerHandler[],
  routerModel: string
): Promise<Classification> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const handlerLines = handlers
    .map((h) => `- intent_key: ${h.intent_key} — ${h.description || h.name}`)
    .join("\n");

  const systemPrompt = `You route utterances from a live phone call to handlers. Handlers:
${handlerLines}
- intent_key: none — small talk, acknowledgements, background noise, or anything the agent can handle alone.

Given the last customer utterance (and brief context), return ONLY JSON:
{"intent":"<intent_key or none>","confidence":<0..1>}
Pick "none" unless the utterance clearly needs a handler's knowledge or action.`;

  const contextBlock =
    recentTurns.length > 0 ? `Recent turns:\n${recentTurns.join("\n")}\n\n` : "";

  // gpt-5.x models reject custom temperature and prefer max_completion_tokens;
  // build params loosely so the model is swappable from lab settings.
  const params: Record<string, unknown> = {
    model: routerModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${contextBlock}Customer utterance: "${utterance}"` },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 600,
  };
  // gpt-5.x models reject custom temperature; older models prefer max_tokens.
  if (!routerModel.startsWith("gpt-5")) {
    params.temperature = 0;
    params.max_tokens = 100;
    delete params.max_completion_tokens;
  }

  let completion;
  try {
    completion = await openai.chat.completions.create(
      params as unknown as Parameters<typeof openai.chat.completions.create>[0]
    );
  } catch (e: unknown) {
    // Retry once without response_format for models that don't support json_object
    if (e instanceof Error && /response_format|json_object/i.test(e.message)) {
      delete params.response_format;
      completion = await openai.chat.completions.create(
        params as unknown as Parameters<typeof openai.chat.completions.create>[0]
      );
    } else {
      throw e;
    }
  }

  const raw =
    "choices" in completion ? completion.choices[0]?.message?.content ?? "" : "";
  try {
    // Tolerate markdown fences / prose around the JSON
    const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw;
    const parsed = JSON.parse(jsonText);
    const intent = typeof parsed.intent === "string" ? parsed.intent : "none";
    const confidence =
      typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
    return { intent, confidence, raw };
  } catch {
    return { intent: "none", confidence: 0, raw };
  }
}
