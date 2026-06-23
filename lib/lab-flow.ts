// Pure graph-walk helpers for the Script runtime (no DB/IO).
import type { ListenerScriptNode, ListenerScriptEdge } from "./database.types";

export function findStartNode(nodes: ListenerScriptNode[]): ListenerScriptNode | null {
  return nodes.find((n) => n.type === "start") ?? null;
}

export function nodeById(nodes: ListenerScriptNode[], id: string | null): ListenerScriptNode | null {
  if (!id) return null;
  return nodes.find((n) => n.id === id) ?? null;
}

/**
 * Pick the outgoing edge to follow from `currentNodeId` given the classified
 * intent and the tags of the matched scenario. Non-fallback edges are checked
 * first; an `else` edge is the fallback.
 */
export function pickNextEdge(
  edges: ListenerScriptEdge[],
  currentNodeId: string,
  intent: string,
  tags: string[]
): ListenerScriptEdge | null {
  const outs = edges.filter((e) => e.source_node_id === currentNodeId);
  for (const e of outs) {
    const c = (e.condition ?? {}) as { kind?: string; value?: string };
    if (c.kind === "always") return e;
    if (c.kind === "intent" && c.value === intent) return e;
    if (c.kind === "tag" && c.value && tags.includes(c.value)) return e;
  }
  return outs.find((e) => ((e.condition ?? {}) as { kind?: string }).kind === "else") ?? null;
}
