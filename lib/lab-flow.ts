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

type Cond = { kind?: string; by?: string; value?: string; maxLoops?: number; handle?: string };
function cond(e: ListenerScriptEdge): Cond {
  return (e.condition ?? {}) as Cond;
}
function handleOf(e: ListenerScriptEdge): string {
  const c = cond(e);
  if (c.handle) return c.handle;
  // legacy: derive from old condition shape
  if (c.kind === "loop") return "loop";
  if (c.kind === "branch") return c.by === "else" ? "else" : "then";
  if (c.kind === "intent" || c.kind === "tag") return "then";
  if (c.kind === "else") return "else";
  return "out";
}

export type FlowCtx = {
  intent: string;
  tags: string[];
  result: string | null;
  /** read/increment a per-edge loop counter; returns the new count */
  bumpLoop?: (edgeId: string) => number;
};

/**
 * Pick the outgoing edge to follow from a node. Routing now lives in the box:
 * - if/else boxes evaluate their condition → take the `then` or `else` handle
 * - loop boxes take `loop` until the max is hit, then `exit`
 * - everything else takes its single outgoing edge
 * Legacy condition-edges are still honoured.
 */
export function pickNextEdge(
  node: ListenerScriptNode,
  edges: ListenerScriptEdge[],
  ctx: FlowCtx
): ListenerScriptEdge | null {
  const outs = edges.filter((e) => e.source_node_id === node.id);
  if (outs.length === 0) return null;
  const ct = contentTypeOf(node);
  const cfg = (node.config ?? {}) as Record<string, unknown>;

  if (ct === "ifelse") {
    const by = (cfg.condBy as string) ?? "intent";
    const value = (cfg.condValue as string) ?? "";
    let truthy = false;
    if (by === "intent") truthy = value === ctx.intent;
    else if (by === "tag") truthy = !!value && ctx.tags.includes(value);
    else if (by === "result") truthy = !!ctx.result && value === ctx.result;
    const want = truthy ? "then" : "else";
    return outs.find((e) => handleOf(e) === want) ?? outs.find((e) => handleOf(e) === "out") ?? null;
  }

  if (ct === "loop") {
    const max = (cfg.maxLoops as number) ?? 3;
    const n = ctx.bumpLoop ? ctx.bumpLoop(node.id) : 1;
    const want = n <= max ? "loop" : "exit";
    return outs.find((e) => handleOf(e) === want) ?? null;
  }

  // Legacy condition edges (old graphs that branched on the edge itself).
  const legacy = outs.filter((e) => {
    const c = cond(e);
    return c.kind === "intent" || c.kind === "tag" || c.kind === "branch";
  });
  if (legacy.length) {
    for (const e of legacy) {
      const c = cond(e);
      const by = c.by ?? c.kind;
      if (by === "intent" && c.value === ctx.intent) return e;
      if (by === "tag" && c.value && ctx.tags.includes(c.value)) return e;
      if (by === "result" && ctx.result && c.value === ctx.result) return e;
    }
    const fallback = outs.find((e) => handleOf(e) === "else");
    if (fallback) return fallback;
  }

  // Plain: first outgoing connector.
  return outs[0] ?? null;
}
