import { supabase } from "./supabase";
import type { TranscriptMessage } from "./types";
import type { AgentConfig, CallSettings, CallTranscript, Comment, Conversation, Feedback, Message, PromptLibraryItem, TrackerItem, TrackerReply, TranscriptQuestion, ItemStatus } from "./database.types";

// --- Conversations ---

export async function saveConversation(
  title: string,
  transcriptMessages: TranscriptMessage[],
  vapiCallId?: string | null,
  assistantId?: string | null,
  assistantName?: string | null,
  tester?: string | null,
  promptId?: string | null,
  promptName?: string | null,
  promptContent?: string | null
): Promise<string> {
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .insert({
      title,
      vapi_call_id: vapiCallId ?? null,
      assistant_id: assistantId ?? null,
      assistant_name: assistantName ?? null,
      tester: tester ?? null,
      prompt_id: promptId ?? null,
      prompt_name: promptName ?? null,
      prompt_content: promptContent ?? null,
    })
    .select("id")
    .single();

  if (convErr || !conv) throw new Error(convErr?.message ?? "Failed to create conversation");

  const validMessages = transcriptMessages.filter((m) => m.content);
  if (validMessages.length > 0) {
    const rows = validMessages.map((m, i) => ({
      conversation_id: conv.id,
      role: m.role as "user" | "agent",
      content: m.content,
      order: i,
    }));

    const { error: msgErr } = await supabase.from("messages").insert(rows);
    if (msgErr) throw new Error(msgErr.message);
  }

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

export async function updateConversationTitle(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ title })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// Returns all favorite rows so the UI can derive per-user state and counts
export async function listConversationFavorites(): Promise<{ conversation_id: string; user_nickname: string }[]> {
  const { data, error } = await supabase
    .from("conversation_favorites")
    .select("conversation_id, user_nickname");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addConversationFavorite(conversationId: string, userNickname: string): Promise<void> {
  const { error } = await supabase
    .from("conversation_favorites")
    .insert({ conversation_id: conversationId, user_nickname: userNickname });
  if (error) throw new Error(error.message);
}

export async function removeConversationFavorite(conversationId: string, userNickname: string): Promise<void> {
  const { error } = await supabase
    .from("conversation_favorites")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_nickname", userNickname);
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

// --- Call Transcripts ---

export async function listCallTranscripts(): Promise<CallTranscript[]> {
  const { data, error } = await supabase
    .from("call_transcripts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getCallTranscript(id: string): Promise<CallTranscript> {
  const { data, error } = await supabase
    .from("call_transcripts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Transcript not found");
  return data;
}

export async function createCallTranscript(
  title: string,
  content: string
): Promise<CallTranscript> {
  const { data, error } = await supabase
    .from("call_transcripts")
    .insert({ title, content })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create transcript");
  return data;
}

export async function updateCallTranscript(
  id: string,
  updates: { notes?: string; classification?: "good" | "bad" | "unclassified"; ai_analysis?: string; title?: string }
): Promise<void> {
  const { error } = await supabase
    .from("call_transcripts")
    .update(updates)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function deleteCallTranscript(id: string): Promise<void> {
  const { error } = await supabase
    .from("call_transcripts")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

// --- Transcript Questions ---

export async function listTranscriptQuestions(): Promise<TranscriptQuestion[]> {
  const { data, error } = await supabase
    .from("transcript_questions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveTranscriptQuestion(
  question: string,
  answer: string,
  transcriptIds: string[]
): Promise<TranscriptQuestion> {
  const { data, error } = await supabase
    .from("transcript_questions")
    .insert({ question, answer, transcript_ids: transcriptIds })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to save question");
  return data;
}

export async function updateTranscriptQuestion(
  id: string,
  answer: string
): Promise<void> {
  const { error } = await supabase
    .from("transcript_questions")
    .update({ answer })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function deleteTranscriptQuestion(id: string): Promise<void> {
  const { error } = await supabase
    .from("transcript_questions")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

// --- Prompt Library ---

export async function listPrompts(assistantId?: string | null): Promise<PromptLibraryItem[]> {
  let q = supabase.from("prompt_library").select("*").order("created_at", { ascending: false });
  if (assistantId) q = q.eq("assistant_id", assistantId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPrompt(
  name: string,
  content: string,
  notes?: string,
  assistantId?: string | null
): Promise<PromptLibraryItem> {
  const { data, error } = await supabase
    .from("prompt_library")
    .insert({ name, content, notes: notes ?? "", assistant_id: assistantId ?? null })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create prompt");
  return data;
}

export async function updatePrompt(
  id: string,
  updates: { name?: string; content?: string; notes?: string }
): Promise<void> {
  const { error } = await supabase
    .from("prompt_library")
    .update(updates)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function setActivePrompt(id: string, assistantId?: string | null): Promise<void> {
  // Deactivate all prompts for this assistant, then activate the selected one
  const clearQ = supabase.from("prompt_library").update({ is_active: false });
  const cleared = assistantId
    ? await clearQ.eq("assistant_id", assistantId)
    : await clearQ.neq("id", "00000000-0000-0000-0000-000000000000");
  if (cleared.error) throw new Error(cleared.error.message);

  const { error } = await supabase.from("prompt_library").update({ is_active: true }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePrompt(id: string): Promise<void> {
  const { error } = await supabase
    .from("prompt_library")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

// --- Tracker detail helpers ---

export async function getCommentById(id: string): Promise<Comment & { conversation_id: string }> {
  const { data, error } = await supabase
    .from("comments")
    .select("*, messages!inner(conversation_id)")
    .eq("id", id)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Comment not found");
  return {
    id: data.id,
    message_id: data.message_id,
    parent_id: data.parent_id,
    author: data.author,
    content: data.content,
    status: data.status as ItemStatus,
    created_at: data.created_at,
    conversation_id: (data as any).messages.conversation_id,
  };
}

export async function getFeedbackById(id: string): Promise<Feedback> {
  const { data, error } = await supabase
    .from("feedback")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Feedback not found");
  return data;
}

export async function getTrackerItemByConversationId(conversationId: string): Promise<TrackerItem | null> {
  const { data } = await supabase
    .from("tracker_items")
    .select("*")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  return data ?? null;
}

export async function getTrackerItemById(id: string): Promise<TrackerItem> {
  const { data, error } = await supabase
    .from("tracker_items")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Item not found");
  return data;
}

export async function getActivePrompt(assistantId?: string | null): Promise<PromptLibraryItem | null> {
  let q = supabase.from("prompt_library").select("*").eq("is_active", true);
  if (assistantId) q = q.eq("assistant_id", assistantId);
  const { data } = await q.maybeSingle();
  return data ?? null;
}

export async function getCommentsByConversation(conversationId: string): Promise<Comment[]> {
  const { data: msgs, error: msgErr } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId);

  if (msgErr) throw new Error(msgErr.message);
  if (!msgs?.length) return [];

  const messageIds = msgs.map((m) => m.id);

  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .in("message_id", messageIds)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// --- Call Settings ---

export async function getCallSettings(): Promise<CallSettings | null> {
  const { data } = await supabase
    .from("call_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  return data ?? null;
}

export async function saveCallSettings(voice_provider: string, voice_id: string): Promise<void> {
  const { error } = await supabase
    .from("call_settings")
    .upsert({ id: "default", voice_provider, voice_id, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// --- Agent Configs ---

export async function getAgentConfig(assistantId: string): Promise<AgentConfig | null> {
  const { data } = await supabase
    .from("agent_configs")
    .select("*")
    .eq("id", assistantId)
    .maybeSingle();
  return data ?? null;
}

export async function upsertAgentConfig(assistantId: string, name: string, passwordHash: string | null): Promise<void> {
  const { error } = await supabase
    .from("agent_configs")
    .upsert({ id: assistantId, name, password_hash: passwordHash });
  if (error) throw new Error(error.message);
}
