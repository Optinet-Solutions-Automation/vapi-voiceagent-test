-- Listener Lab: Scripts (visual call-flow builder).
-- A Script is a node graph: boxes reference scenarios; edges carry conditions.
-- Run once in the Supabase dashboard SQL editor (project mfnebrospbqhbrxfexie).

create table if not exists public.listener_scripts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  collection_id uuid references public.listener_collections(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nodes (boxes). type: start | say | switch | send_sms | set_variable | transfer | end
create table if not exists public.listener_script_nodes (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.listener_scripts(id) on delete cascade,
  type text not null,
  scenario_id uuid references public.listener_handlers(id) on delete set null,
  label text not null default '',
  config jsonb not null default '{}',     -- type-specific: {mode}, {scopeTags}, {by}, {number}, {name,value}, …
  pos_x double precision not null default 0,
  pos_y double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists script_nodes_script_idx on public.listener_script_nodes (script_id);

-- Edges (arrows). condition: {kind: 'always'|'intent'|'tag'|'else', value?: text}
create table if not exists public.listener_script_edges (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.listener_scripts(id) on delete cascade,
  source_node_id uuid not null references public.listener_script_nodes(id) on delete cascade,
  target_node_id uuid not null references public.listener_script_nodes(id) on delete cascade,
  condition jsonb not null default '{"kind":"always"}',
  label text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists script_edges_script_idx on public.listener_script_edges (script_id);

-- Per-call flow state for the runtime graph-walker.
create table if not exists public.lab_call_flow_state (
  call_id text primary key,
  script_id uuid references public.listener_scripts(id) on delete set null,
  current_node_id uuid,
  variables jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Which script the lab runs for a test call (null = pure reactive, no script).
alter table public.lab_settings
  add column if not exists active_script_id uuid;

-- RLS: permissive, matching the app's other lab tables.
alter table public.listener_scripts enable row level security;
alter table public.listener_script_nodes enable row level security;
alter table public.listener_script_edges enable row level security;
alter table public.lab_call_flow_state enable row level security;
create policy "allow all" on public.listener_scripts for all using (true) with check (true);
create policy "allow all" on public.listener_script_nodes for all using (true) with check (true);
create policy "allow all" on public.listener_script_edges for all using (true) with check (true);
create policy "allow all" on public.lab_call_flow_state for all using (true) with check (true);
