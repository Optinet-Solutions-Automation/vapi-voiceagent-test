-- Run this after the feedback migration.
-- Adds status tracking to comments and feedback, plus a standalone tracker_items table.

-- 1. Add status column to comments
alter table comments add column status text not null default 'open'
  check (status in ('open', 'in_progress', 'done', 'has_question'));

-- 2. Add status column to feedback
alter table feedback add column status text not null default 'open'
  check (status in ('open', 'in_progress', 'done', 'has_question'));

-- 3. Standalone tracker items (for manually added rows not tied to a specific message)
create table tracker_items (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade,
  author text not null default 'reviewer',
  content text not null,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'done', 'has_question')),
  created_at timestamptz default now() not null
);

create index idx_tracker_items_status on tracker_items(status, created_at);

alter table tracker_items enable row level security;
create policy "Allow all on tracker_items" on tracker_items for all using (true) with check (true);

-- 4. Replies on any tracker row (comment, feedback, or tracker_item)
create table tracker_replies (
  id uuid default gen_random_uuid() primary key,
  parent_kind text not null check (parent_kind in ('comment', 'feedback', 'item')),
  parent_id uuid not null,
  author text not null default 'reviewer',
  content text not null,
  created_at timestamptz default now() not null
);

create index idx_tracker_replies_parent on tracker_replies(parent_kind, parent_id, created_at);

alter table tracker_replies enable row level security;
create policy "Allow all on tracker_replies" on tracker_replies for all using (true) with check (true);
