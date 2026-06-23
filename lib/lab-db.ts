// Data access for the Listener Lab (organizer handlers, lab settings, call events).
// Same style as lib/db.ts; the supabase client is isomorphic so the webhook route
// can use these server-side too.
import { supabase } from "./supabase";
import type {
  ListenerHandler,
  LabCallEvent,
  LabSettings,
  ListenerCollection,
  ListenerScript,
  ListenerScriptNode,
  ListenerScriptEdge,
  Database,
} from "./database.types";

type HandlerInsert = Database["public"]["Tables"]["listener_handlers"]["Insert"];
type HandlerUpdate = Database["public"]["Tables"]["listener_handlers"]["Update"];
type EventInsert = Database["public"]["Tables"]["lab_call_events"]["Insert"];
type SettingsUpdate = Database["public"]["Tables"]["lab_settings"]["Update"];

// ── Handlers (Organizer) ──────────────────────────────────────

export async function listHandlers(): Promise<ListenerHandler[]> {
  const { data, error } = await supabase
    .from("listener_handlers")
    .select("*")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createHandler(h: HandlerInsert): Promise<ListenerHandler> {
  const { data, error } = await supabase
    .from("listener_handlers")
    .insert(h)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateHandler(id: string, updates: HandlerUpdate): Promise<void> {
  const { error } = await supabase
    .from("listener_handlers")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteHandler(id: string): Promise<void> {
  const { error } = await supabase.from("listener_handlers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Rename a group across every handler that uses it. */
export async function renameGroup(oldName: string, newName: string): Promise<void> {
  const { error } = await supabase
    .from("listener_handlers")
    .update({ group_name: newName, updated_at: new Date().toISOString() })
    .eq("group_name", oldName);
  if (error) throw new Error(error.message);
}

/** Remove a group — handlers stay but become ungrouped. */
export async function clearGroup(name: string): Promise<void> {
  const { error } = await supabase
    .from("listener_handlers")
    .update({ group_name: "", updated_at: new Date().toISOString() })
    .eq("group_name", name);
  if (error) throw new Error(error.message);
}

// ── Collections (campaign bundles) ────────────────────────────

export async function listCollections(): Promise<ListenerCollection[]> {
  const { data, error } = await supabase
    .from("listener_collections")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCollection(name: string, description = ""): Promise<ListenerCollection> {
  const { data, error } = await supabase
    .from("listener_collections")
    .insert({ name, description })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateCollection(
  id: string,
  updates: { name?: string; description?: string }
): Promise<void> {
  const { error } = await supabase
    .from("listener_collections")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase.from("listener_collections").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Handler IDs that belong to a collection. */
export async function getCollectionHandlerIds(collectionId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("listener_collection_handlers")
    .select("handler_id")
    .eq("collection_id", collectionId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.handler_id);
}

/** Replace a collection's membership with the given handler IDs. */
export async function setCollectionHandlers(collectionId: string, handlerIds: string[]): Promise<void> {
  const del = await supabase
    .from("listener_collection_handlers")
    .delete()
    .eq("collection_id", collectionId);
  if (del.error) throw new Error(del.error.message);
  if (handlerIds.length === 0) return;
  const rows = handlerIds.map((handler_id) => ({ collection_id: collectionId, handler_id }));
  const ins = await supabase.from("listener_collection_handlers").insert(rows);
  if (ins.error) throw new Error(ins.error.message);
}

// ── Scripts (visual call-flow builder) ────────────────────────

export async function listScripts(): Promise<ListenerScript[]> {
  const { data, error } = await supabase
    .from("listener_scripts")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createScript(name: string, collectionId: string | null = null): Promise<ListenerScript> {
  const { data, error } = await supabase
    .from("listener_scripts")
    .insert({ name, collection_id: collectionId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateScript(
  id: string,
  updates: { name?: string; description?: string; collection_id?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("listener_scripts")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteScript(id: string): Promise<void> {
  const { error } = await supabase.from("listener_scripts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export type ScriptGraph = { nodes: ListenerScriptNode[]; edges: ListenerScriptEdge[] };

export async function getScriptGraph(scriptId: string): Promise<ScriptGraph> {
  const [nodesRes, edgesRes] = await Promise.all([
    supabase.from("listener_script_nodes").select("*").eq("script_id", scriptId),
    supabase.from("listener_script_edges").select("*").eq("script_id", scriptId),
  ]);
  if (nodesRes.error) throw new Error(nodesRes.error.message);
  if (edgesRes.error) throw new Error(edgesRes.error.message);
  return { nodes: nodesRes.data ?? [], edges: edgesRes.data ?? [] };
}

type NodeInput = {
  id: string;
  type: string;
  scenario_id: string | null;
  label: string;
  config: Record<string, unknown>;
  pos_x: number;
  pos_y: number;
};
type EdgeInput = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  condition: Record<string, unknown>;
  label: string;
};

/** Replace the whole graph for a script (delete-then-insert). */
export async function saveScriptGraph(
  scriptId: string,
  nodes: NodeInput[],
  edges: EdgeInput[]
): Promise<void> {
  // Edges first (FK to nodes), then nodes.
  await supabase.from("listener_script_edges").delete().eq("script_id", scriptId);
  await supabase.from("listener_script_nodes").delete().eq("script_id", scriptId);
  if (nodes.length) {
    const nrows = nodes.map((n) => ({ ...n, script_id: scriptId }));
    const ni = await supabase.from("listener_script_nodes").insert(nrows);
    if (ni.error) throw new Error(ni.error.message);
  }
  if (edges.length) {
    const erows = edges.map((e) => ({ ...e, script_id: scriptId }));
    const ei = await supabase.from("listener_script_edges").insert(erows);
    if (ei.error) throw new Error(ei.error.message);
  }
  await supabase
    .from("listener_scripts")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", scriptId);
}

// ── Settings ──────────────────────────────────────────────────

export async function getLabSettings(): Promise<LabSettings | null> {
  const { data, error } = await supabase
    .from("lab_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function saveLabSettings(updates: SettingsUpdate): Promise<void> {
  const { error } = await supabase
    .from("lab_settings")
    .upsert({ id: "default", ...updates, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// ── Flow state (runtime graph-walker) ─────────────────────────

export async function getFlowState(callId: string) {
  const { data, error } = await supabase
    .from("lab_call_flow_state")
    .select("*")
    .eq("call_id", callId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertFlowState(
  callId: string,
  scriptId: string | null,
  currentNodeId: string | null,
  variables: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from("lab_call_flow_state").upsert({
    call_id: callId,
    script_id: scriptId,
    current_node_id: currentNodeId,
    variables,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

// ── Call events ───────────────────────────────────────────────

export async function insertLabEvent(event: EventInsert): Promise<void> {
  const { error } = await supabase.from("lab_call_events").insert(event);
  if (error) throw new Error(error.message);
}

export async function listLabCallEvents(callId: string, afterId = 0): Promise<LabCallEvent[]> {
  const { data, error } = await supabase
    .from("lab_call_events")
    .select("*")
    .eq("call_id", callId)
    .gt("id", afterId)
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Recent conversation turns for a call, oldest-first, as "Customer:/Agent:" lines.
 *  Gives the router LLM context so a keyword can't hijack the intent. */
export async function getRecentTurns(callId: string, limit = 6): Promise<string[]> {
  const { data, error } = await supabase
    .from("lab_call_events")
    .select("event_type, content")
    .eq("call_id", callId)
    .in("event_type", ["utterance", "injected"])
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .reverse()
    .map((e) => (e.event_type === "utterance" ? "Customer: " : "Agent: ") + (e.content ?? ""));
}

export async function getLastInjectedEvent(callId: string): Promise<LabCallEvent | null> {
  const { data, error } = await supabase
    .from("lab_call_events")
    .select("*")
    .eq("call_id", callId)
    .eq("event_type", "injected")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Recent events across calls, for grouping into "past runs" client-side. */
export async function listRecentLabEvents(limit = 1000): Promise<LabCallEvent[]> {
  const { data, error } = await supabase
    .from("lab_call_events")
    .select("*")
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
