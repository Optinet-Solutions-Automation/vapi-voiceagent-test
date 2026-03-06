import { supabase } from "./supabase";
import type { TranscriptMessage } from "./types";
import type { Comment, Conversation, Message } from "./database.types";

// --- Conversations ---

export async function saveConversation(
  title: string,
  transcriptMessages: TranscriptMessage[]
): Promise<string> {
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .insert({ title })
    .select("id")
    .single();

  if (convErr || !conv) throw new Error(convErr?.message ?? "Failed to create conversation");

  const rows = transcriptMessages.map((m, i) => ({
    conversation_id: conv.id,
    role: m.role as "user" | "agent",
    content: m.content,
    order: i,
  }));

  const { error: msgErr } = await supabase.from("messages").insert(rows);
  if (msgErr) throw new Error(msgErr.message);

  return conv.id;
}

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getConversationWithMessages(
  conversationId: string
): Promise<{ conversation: Conversation; messages: Message[] }> {
  const [convRes, msgRes] = await Promise.all([
    supabase.from("conversations").select("*").eq("id", conversationId).single(),
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("order", { ascending: true }),
  ]);

  if (convRes.error) throw new Error(convRes.error.message);
  if (msgRes.error) throw new Error(msgRes.error.message);

  return { conversation: convRes.data!, messages: msgRes.data ?? [] };
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId);
  if (error) throw new Error(error.message);
}

// --- Comments ---

export async function getCommentsForMessage(messageId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("message_id", messageId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addComment(
  messageId: string,
  content: string,
  author: string = "reviewer",
  parentId?: string
): Promise<Comment> {
  const { data, error } = await supabase
    .from("comments")
    .insert({
      message_id: messageId,
      content,
      author,
      parent_id: parentId ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data!;
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) throw new Error(error.message);
}
