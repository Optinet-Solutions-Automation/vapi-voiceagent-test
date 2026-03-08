-- Run this if you already applied the status columns and tracker_items table.
-- This adds only the tracker_replies table.

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
