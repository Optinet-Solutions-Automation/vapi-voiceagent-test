-- Run this if you already have the conversations, messages, and comments tables.
-- This adds only the feedback table.

create table feedback (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade not null,
  author text not null default 'reviewer',
  rating int check (rating between 1 and 5),
  text_content text,
  audio_url text,
  created_at timestamptz default now() not null
);

create index idx_feedback_conversation on feedback(conversation_id, created_at);

alter table feedback enable row level security;

create policy "Allow all on feedback" on feedback for all using (true) with check (true);
