// Data access for the Listener Lab (organizer handlers, lab settings, call events).
// Same style as lib/db.ts; the supabase client is isomorphic so the webhook route
// can use these server-side too.
import { supabase } from "./supabase";
import type { ListenerHandler, LabCallEvent, LabSettings, Database } from "./database.types";

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
