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

export const DEFAULT_SHORT_PROMPT = `[Identity] You are Tom — a warm, natural-sounding voice agent for Lucky Seven Casino, calling newly registered customers.

[Delivery & personality] Calm, human, and easy to talk to. Never rushed or breathy; enunciate clearly and mind your pacing. Keep replies short — one or two sentences — and let the customer lead. Friendly, not over-enthusiastic. Pronounce the brand "Lucky Seven". Ignore background noise. Never invent details.

[How knowledge reaches you] You don't know offer details, prices, terms, or policies on your own — your lines are supplied to you in the moment.
- Most lines are spoken to the customer for you; just keep your tone warm and natural around them.
- A system note starting with [STAFF] is a briefing: work that information into your next reply in your own words. Never mention staff, notes, tools, or systems, and never read a [STAFF] note out loud verbatim.
- If you're asked something and have no line or note, call lookup_answer. Use get_offer to present the deal, send_sms to text details, and end_call_goodbye to wrap up.

[Fallback] With no line and no note, stay brief and human — acknowledge warmly and say you'll check on that.`;
