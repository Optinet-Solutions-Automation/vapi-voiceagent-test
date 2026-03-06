-- Run this in your Supabase SQL Editor to create the required tables

-- Conversations table
create table conversations (
  id uuid default gen_random_uuid() primary key,
  title text not null default 'Untitled Conversation',
  created_at timestamptz default now() not null
);

-- Messages within a conversation
create table messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text check (role in ('user', 'agent')) not null,
  content text not null,
  "order" int not null,
  created_at timestamptz default now() not null
);

-- Comments / threads on individual messages
create table comments (
  id uuid default gen_random_uuid() primary key,
  message_id uuid references messages(id) on delete cascade not null,
  parent_id uuid references comments(id) on delete cascade,
  author text not null default 'reviewer',
  content text not null,
  created_at timestamptz default now() not null
);

-- Indexes for fast lookups
create index idx_messages_conversation on messages(conversation_id, "order");
create index idx_comments_message on comments(message_id, created_at);
create index idx_comments_parent on comments(parent_id);

-- Enable RLS (allow all for now since this is an internal testing tool)
alter table conversations enable row level security;
alter table messages enable row level security;
alter table comments enable row level security;

create policy "Allow all on conversations" on conversations for all using (true) with check (true);
create policy "Allow all on messages" on messages for all using (true) with check (true);
create policy "Allow all on comments" on comments for all using (true) with check (true);
