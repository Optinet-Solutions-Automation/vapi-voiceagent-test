// Canonical VAPI tool definitions for the Listener Lab assistant.
// Single source of truth so the configure route and the webhook handler agree on names.

export const LAB_TOOL_NAMES = [
  "lookup_answer",
  "get_offer",
  "send_sms",
  "end_call_goodbye",
] as const;

export type LabToolName = (typeof LAB_TOOL_NAMES)[number];

// Tools inherit the assistant-level server.url — no per-tool server config.
export const LAB_TOOLS = [
  {
    type: "function",
    async: false,
    function: {
      name: "lookup_answer",
      description:
        "Look up the answer to any factual question the customer asks — prices, product details, policies, offers, account questions. Always use this instead of answering from your own knowledge.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The customer's question, as completely as possible.",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    async: false,
    function: {
      name: "get_offer",
      description:
        "Get the current offer/deal to present to the customer. Use when the customer shows interest or when it's the right moment to pitch.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    async: false,
    function: {
      name: "send_sms",
      description:
        "Send the customer an SMS with the offer details. Use when the customer agrees to receive details by text.",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Optional custom message; leave empty to send the standard offer SMS.",
          },
        },
      },
    },
  },
  {
    type: "function",
    async: false,
    function: {
      name: "end_call_goodbye",
      description:
        "End the call politely. Use when the conversation has reached its natural end or the customer asks to stop.",
      parameters: { type: "object", properties: {} },
    },
  },
];

export const DEFAULT_SHORT_PROMPT = `You are a warm, concise phone agent. You do not know any product facts, prices, or policies yourself.
- For any factual or knowledge question, call lookup_answer with the question.
- To present a deal, call get_offer. To text the customer, call send_sms.
- When the conversation is finished, call end_call_goodbye.
Mid-call you may receive system messages starting with [STAFF]. Treat them as authoritative briefing notes: weave the information into your very next reply, naturally and in your own voice. Never read them verbatim, never mention staff, notes, or systems. If a [STAFF] note contradicts something you said, smoothly correct yourself. If you have no note and no tool result, say you'll check and move on.`;
