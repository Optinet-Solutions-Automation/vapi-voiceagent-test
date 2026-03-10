import { supabase } from "./supabase";
import type { TranscriptMessage } from "./types";
import type { Comment, Conversation, Feedback, Message, TrackerItem, TrackerReply, ItemStatus } from "./database.types";

// --- Conversations ---

export async function saveConversation(
  title: string,
  transcriptMessages: TranscriptMessage[],
  vapiCallId?: string | null
): Promise<string> {
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .insert({ title, vapi_call_id: vapiCallId ?? null })
    .select("id")
    .single();

  if (convErr || !conv) throw new Error(convErr?.message ?? "Failed to create conversation");

  const validMessages = transcriptMessages.filter((m) => m.content);
  const rows = validMessages.map((m, i) => ({
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

// --- Feedback ---

export async function submitFeedback(
  conversationId: string,
  author: string,
  rating: number | null,
  textContent: string | null,
  audioUrl: string | null
): Promise<Feedback> {
  const { data, error } = await supabase
    .from("feedback")
    .insert({
      conversation_id: conversationId,
      author,
      rating,
      text_content: textContent,
      audio_url: audioUrl,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data!;
}

export async function getFeedbackForConversation(
  conversationId: string
): Promise<Feedback[]> {
  const { data, error } = await supabase
    .from("feedback")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// --- Tracker: aggregated views ---

export type CommentWithContext = Comment & {
  message_content: string;
  message_role: "user" | "agent";
  conversation_id: string;
  conversation_title: string;
};

export type FeedbackWithContext = Feedback & {
  conversation_title: string;
};

export async function getAllCommentsWithContext(): Promise<CommentWithContext[]> {
  const { data, error } = await supabase
    .from("comments")
    .select("*, messages!inner(content, role, conversation_id, conversations!inner(title))")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    message_id: row.message_id,
    parent_id: row.parent_id,
    author: row.author,
    content: row.content,
    status: row.status,
    created_at: row.created_at,
    message_content: row.messages.content,
    message_role: row.messages.role,
    conversation_id: row.messages.conversation_id,
    conversation_title: row.messages.conversations.title,
  }));
}

export async function getAllFeedbackWithContext(): Promise<FeedbackWithContext[]> {
  const { data, error } = await supabase
    .from("feedback")
    .select("*, conversations!inner(title)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    conversation_id: row.conversation_id,
    author: row.author,
    rating: row.rating,
    text_content: row.text_content,
    audio_url: row.audio_url,
    status: row.status,
    created_at: row.created_at,
    conversation_title: row.conversations.title,
  }));
}

export async function getAllTrackerItems(): Promise<
  (TrackerItem & { conversation_title: string | null })[]
> {
  const { data, error } = await supabase
    .from("tracker_items")
    .select("*, conversations(title)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    ...row,
    conversation_title: row.conversations?.title ?? null,
  }));
}

export async function addTrackerItem(
  content: string,
  author: string,
  conversationId?: string
): Promise<TrackerItem> {
  const { data, error } = await supabase
    .from("tracker_items")
    .insert({
      content,
      author,
      conversation_id: conversationId ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data!;
}

export async function updateCommentStatus(id: string, status: ItemStatus): Promise<void> {
  const { error } = await supabase.from("comments").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateFeedbackStatus(id: string, status: ItemStatus): Promise<void> {
  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateTrackerItemStatus(id: string, status: ItemStatus): Promise<void> {
  const { error } = await supabase.from("tracker_items").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTrackerItem(id: string): Promise<void> {
  const { error } = await supabase.from("tracker_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteFeedback(id: string): Promise<void> {
  const { error } = await supabase.from("feedback").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// --- Tracker replies ---

export async function getReplies(
  parentKind: "comment" | "feedback" | "item",
  parentId: string
): Promise<TrackerReply[]> {
  const { data, error } = await supabase
    .from("tracker_replies")
    .select("*")
    .eq("parent_kind", parentKind)
    .eq("parent_id", parentId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addReply(
  parentKind: "comment" | "feedback" | "item",
  parentId: string,
  content: string,
  author: string
): Promise<TrackerReply> {
  const { data, error } = await supabase
    .from("tracker_replies")
    .insert({ parent_kind: parentKind, parent_id: parentId, content, author })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data!;
}

export async function deleteReply(id: string): Promise<void> {
  const { error } = await supabase.from("tracker_replies").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

