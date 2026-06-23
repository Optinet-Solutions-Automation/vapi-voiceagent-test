-- Listener Lab: Tags (multi-label per handler) + Collections (campaign bundles).
-- Run once in the Supabase dashboard SQL editor (project mfnebrospbqhbrxfexie).

-- 1. Tags — multiple category labels per handler (replaces the single group_name).
alter table public.listener_handlers
  add column if not exists tags text[] not null default '{}';

-- Migrate the existing single group into the tags array.
update public.listener_handlers
  set tags = array[group_name]
  where group_name is not null and group_name <> '' and tags = '{}';

-- 2. Collections — named, campaign-ready bundles of handlers (many-to-many).
create table if not exists public.listener_collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listener_collection_handlers (
  collection_id uuid not null references public.listener_collections(id) on delete cascade,
  handler_id uuid not null references public.listener_handlers(id) on delete cascade,
  primary key (collection_id, handler_id)
);

-- 3. The active collection scopes which handlers the listener considers.
alter table public.lab_settings
  add column if not exists active_collection_id uuid;

-- RLS: permissive, matching the app's other lab tables.
alter table public.listener_collections enable row level security;
alter table public.listener_collection_handlers enable row level security;
create policy "allow all" on public.listener_collections for all using (true) with check (true);
create policy "allow all" on public.listener_collection_handlers for all using (true) with check (true);
