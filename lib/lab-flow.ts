// Pure graph-walk helpers for the Script runtime (no DB/IO).
import type { ListenerScriptNode, ListenerScriptEdge } from "./database.types";

export function findStartNode(nodes: ListenerScriptNode[]): ListenerScriptNode | null {
  return nodes.find((n) => n.type === "start") ?? null;
}

/** Entry node: a Start box if present, else a box with no incoming edge, else the first box.
 *  Lets a (sub-)workflow omit a Start box and just begin at its root. */
export function findEntryNode(
  nodes: ListenerScriptNode[],
  edges: ListenerScriptEdge[]
): ListenerScriptNode | null {
  const start = nodes.find((n) => n.type === "start");
  if (start) return start;
  const targeted = new Set(edges.map((e) => e.target_node_id));
  return nodes.find((n) => !targeted.has(n.id)) ?? nodes[0] ?? null;
}

export function nodeById(nodes: ListenerScriptNode[], id: string | null): ListenerScriptNode | null {
  if (!id) return null;
  return nodes.find((n) => n.id === id) ?? null;
}

/** The content a Step box runs (new model in config.contentType; legacy in node.type). */
export function contentTypeOf(node: ListenerScriptNode): string {
  if (node.type === "start") return "start";
  const ct = (node.config as Record<string, unknown>)?.contentType as string | undefined;
  if (ct) return ct;
  // legacy node.type → content
  if (node.type === "say" || node.type === "switch") return "scenario";
  if (node.type === "send_sms") return "send_sms";
  if (node.type === "transfer") return "transfer";
  if (node.type === "end") return "end";
  return "noop";
}

type Cond = { kind?: string; by?: string; value?: string; maxLoops?: number };
function cond(e: ListenerScriptEdge): Cond {
  return (e.condition ?? {}) as Cond;
}

/** Does an edge match given the classified intent, tags, and an optional sub-workflow result? */
function edgeMatches(e: ListenerScriptEdge, intent: string, tags: string[], result: string | null): boolean {
  const c = cond(e);
  // New model
  if (c.kind === "plain" || c.kind === "loop") return true; // loop is taken when reached (count-guarded by caller)
  if (c.kind === "branch") {
    if (c.by === "else") return false; // fallback handled separately
    if (c.by === "intent") return c.value === intent;
    if (c.by === "tag") return !!c.value && tags.includes(c.value);
    if (c.by === "result") return !!result && c.value === result;
    return false;
  }
  // Legacy model
  if (c.kind === "always") return true;
  if (c.kind === "intent") return c.value === intent;
  if (c.kind === "tag") return !!c.value && tags.includes(c.value);
  return false; // 'else'
}

function isElse(e: ListenerScriptEdge): boolean {
  const c = cond(e);
  return (c.kind === "branch" && c.by === "else") || c.kind === "else";
}

/**
 * Pick the outgoing edge to follow from `currentNodeId`. Non-fallback edges are
 * checked first; an `else`/fallback edge is used if nothing else matched.
 */
export function pickNextEdge(
  edges: ListenerScriptEdge[],
  currentNodeId: string,
  intent: string,
  tags: string[],
  result: string | null = null
): ListenerScriptEdge | null {
  const outs = edges.filter((e) => e.source_node_id === currentNodeId);
  for (const e of outs) {
    if (!isElse(e) && edgeMatches(e, intent, tags, result)) return e;
  }
  return outs.find((e) => isElse(e)) ?? null;
}

export function edgeIsLoop(e: ListenerScriptEdge): boolean {
  return (e.condition as Cond)?.kind === "loop";
}
