// Data access for the Listener Lab (organizer handlers, lab settings, call events).
// Same style as lib/db.ts; the supabase client is isomorphic so the webhook route
// can use these server-side too.
import { supabase } from "./supabase";
import type {
  ListenerHandler,
  LabCallEvent,
  LabSettings,
  ListenerCollection,
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
