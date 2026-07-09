// Server-only: the brief-ahead compiler. The Script Builder graph is no
// longer interpreted reactively (classify → pick line → inject → hope the
// trigger lands); instead each node's OUTGOING neighborhood is compiled into
// a "[CURRENT STAGE]" briefing pushed to the model BEFORE the customer's
// next turn — while the agent is still talking, which is free time. The
// model then answers natively at VAPI speed, choosing among the authored
// lines; the engine's runtime job shrinks to navigation (flow state, the
// next briefing), actions (SMS / hangup / transfer) and auditing.
import type { ListenerHandler, ListenerScriptNode, ListenerScriptEdge } from "./database.types";
import { getCollectionHandlerIds } from "./lab-db";
import { contentTypeOf } from "./lab-flow";

type Graph = { nodes: ListenerScriptNode[]; edges: ListenerScriptEdge[] };
type Cfg = Record<string, unknown>;

const MEMBER_CAP = 12;

const cfgOf = (n: ListenerScriptNode): Cfg => (n.config ?? {}) as Cfg;
const isAnyEdge = (e: ListenerScriptEdge): boolean => {
  const c = (e.condition ?? {}) as Cfg;
  return ((c.by as string) ?? (c.kind as string)) === "any";
};

/** A line, framed by its delivery choice. Authored lines are often written
 *  as instructions ("Explain that…") — the reword framing covers both. */
function renderLine(h: ListenerHandler): string {
  const t = (h.response_template ?? "").trim();
  return h.delivery === "verbatim"
    ? `say EXACTLY, word for word: "${t}"`
    : `say in your own words (keep facts, numbers and terms exact): "${t}"`;
}

/** Disabled boxes pass through silently at runtime — briefings follow the
 *  same wire so the menu describes what will actually be said. */
function resolveThroughDisabled(graph: Graph, targetId: string): ListenerScriptNode | null {
  let node = graph.nodes.find((n) => n.id === targetId) ?? null;
  for (let hops = 0; node && cfgOf(node).disabled === true && hops < 5; hops++) {
    const out = graph.edges.find((e) => e.source_node_id === node!.id);
    node = out ? graph.nodes.find((n) => n.id === out.target_node_id) ?? null : null;
  }
  return node;
}

/** What the target box wants said, as menu text for the model. */
async function targetSays(node: ListenerScriptNode, byId: Map<string, ListenerHandler>, handlers: ListenerHandler[]): Promise<string> {
  const cfg = cfgOf(node);
  const ct = contentTypeOf(node);
  const statements = (((cfg.statements as string[]) ?? []).map((s) => (s ?? "").trim()).filter(Boolean));
  const rider = statements.length
    ? `\n  Then ALWAYS continue in the SAME reply with: ${statements.map((s) => `"${s}"`).join(" …then… ")} (if it reads as an instruction to you, do what it says in the customer's language — never read instruction wording aloud).`
    : "";

  if (ct === "scenario") {
    const cand = (node.scenario_id ? byId.get(node.scenario_id) : undefined) ?? byId.get(((cfg.candidateScenarioIds as string[]) ?? [])[0] ?? "");
    const line = cand?.response_template?.trim()
      ? `  ${renderLine(cand)}`
      : `  (no line authored here — bridge with ONE short, neutral sentence; invent nothing, ask nothing)`;
    return line + rider;
  }

  if (ct === "collection") {
    const ids = cfg.collectionId ? await getCollectionHandlerIds(cfg.collectionId as string).catch(() => [] as string[]) : [];
    const members = handlers.filter((h) => ids.includes(h.id) && h.enabled && (h.response_template ?? "").trim() && h.action_type !== "ignore");
    const shown = members.slice(0, MEMBER_CAP);
    const lines = shown.map((h) => `  - If ${h.description?.trim() || h.name}: ${renderLine(h)}`);
    if (members.length > shown.length) lines.push(`  - (${members.length - shown.length} more exist — if one clearly fits, answer in the same spirit and length.)`);
    // The else ladder, in the same order the engine used to walk it:
    // written else line → else collection → neutral bridge.
    const elseHandler = node.scenario_id ? byId.get(node.scenario_id) : undefined;
    if (elseHandler?.response_template?.trim()) {
      lines.push(`  - If NOTHING above fits: ${renderLine(elseHandler)}`);
    } else if (cfg.elseCollectionId) {
      const eids = await getCollectionHandlerIds(cfg.elseCollectionId as string).catch(() => [] as string[]);
      const fallbacks = handlers.filter((h) => eids.includes(h.id) && h.enabled && (h.response_template ?? "").trim() && h.action_type !== "ignore").slice(0, 6);
      for (const h of fallbacks) lines.push(`  - Fallback — if ${h.description?.trim() || h.name}: ${renderLine(h)}`);
      lines.push(`  - If truly NOTHING fits: bridge with ONE short, neutral sentence (invent nothing, ask nothing).`);
    } else {
      lines.push(`  - If NOTHING above fits: bridge with ONE short, neutral sentence (invent nothing, ask nothing).`);
    }
    return `  Answer with the best-fitting line below (if several fit, blend them into ONE short reply):\n${lines.join("\n")}` + rider;
  }

  if (ct === "send_sms") {
    const h = node.scenario_id ? byId.get(node.scenario_id) : undefined;
    const line = h?.response_template?.trim() ? renderLine(h) : `say in your own words: "The text with the details is on its way."`;
    return `  Confirm the text message — ${line}. (The system truly sends the SMS; say it is on the way, never that it already arrived.)` + rider;
  }

  if (ct === "end") {
    const h = node.scenario_id ? byId.get(node.scenario_id) : undefined;
    const statementsTail = statements.length ? " " + statements.join(" ") : "";
    if (h?.delivery === "reword" && h?.response_template?.trim()) {
      return `  Deliver this goodbye in your own words — nothing else, no questions: "${h.response_template.trim()}${statementsTail}" — the system ends the call right after you say it.`;
    }
    return `  The system itself speaks the goodbye and ends the call — add NOTHING beyond at most one filler.`;
  }

  if (ct === "transfer") return `  The system announces the transfer and connects the call — add NOTHING beyond at most one filler.`;
  if (ct === "wait") return `  (the script simply listens here — respond with at most one filler and let the customer continue)`;
  return `  (the script advances behind the scenes — reply with at most one filler; your next instructions follow)`;
}

/** Compile the menu for "the flow now sits at `nodeId`": one path per
 *  outgoing connector, each describing what its target box wants said.
 *  Returns null when the node has no outgoing paths (terminal). */
export async function compileStageBriefing(graph: Graph, nodeId: string, handlers: ListenerHandler[]): Promise<string | null> {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  // Silence paths ({kind:"timeout"}) are engine plumbing, not customer-reply
  // routes — the poll-driven silence advance walks them, so they never
  // belong in the model's menu.
  const outs = graph.edges.filter((e) => e.source_node_id === nodeId && ((e.condition ?? {}) as Cfg).kind !== "timeout");
  if (!outs.length) return null;
  const byId = new Map(handlers.map((h) => [h.id, h] as const));
  const ordered = [...outs.filter((e) => !isAnyEdge(e)), ...outs.filter(isAnyEdge)];
  const bullets: string[] = [];
  for (const e of ordered) {
    const target = resolveThroughDisabled(graph, e.target_node_id);
    if (!target) continue;
    const c = (e.condition ?? {}) as Cfg;
    const matcher = handlers.find((h) => h.intent_key === (c.value as string));
    const when = isAnyEdge(e)
      ? "For ANY other reply"
      : `When: ${matcher?.description?.trim() || matcher?.name || String(c.value ?? "the matching reply")}`;
    bullets.push(`• ${when} →\n${await targetSays(target, byId, handlers)}`);
  }
  if (!bullets.length) return null;
  return [
    `[CURRENT STAGE — "${node.label || "next step"}"]`,
    `This supersedes every earlier CURRENT STAGE section — it ALONE governs your next reply. Answer the customer's next turn through exactly one of these paths:`,
    bullets.join("\n"),
    `Stage rules: reply IMMEDIATELY — never wait in silence for anything; open with at most ONE approved filler; if the customer raised several points, blend the matching lines into ONE short reply; use ONLY the lines above plus approved fillers; where a line reads as an instruction to you ("Explain that…", "Mention…"), do what it says in the customer's language — never read instruction wording aloud; never invent facts, prices, offers, account activity or questions; if you already said a line earlier in the call, rephrase it with new emphasis — never recite it twice.`,
  ].join("\n");
}
