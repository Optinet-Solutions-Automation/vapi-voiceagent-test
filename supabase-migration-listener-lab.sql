-- Listener Lab migration
-- Run once in the Supabase dashboard SQL editor (project mfnebrospbqhbrxfexie).

-- 1. Organizer registry: situation handlers the router LLM matches against
create table public.listener_handlers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  intent_key text not null unique,
  description text not null default '',
  response_template text not null default '',
  action_type text not null default 'answer'
    check (action_type in ('answer','send_sms','give_offer','end_call','ignore')),
  enabled boolean not null default true,
  priority int not null default 100,
  mode text not null default 'both' check (mode in ('tool','listener','both')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Per-call event log: the listener monitor + latency source of truth
create table public.lab_call_events (
  id bigint generated always as identity primary key,
  call_id text not null,
  event_type text not null,
  role text,
  content text,
  intent_key text,
  confidence numeric,
  handler_id uuid references public.listener_handlers(id) on delete set null,
  action_type text,
  utterance_at timestamptz,
  received_at timestamptz not null default now(),
  classified_at timestamptz,
  injected_at timestamptz,
  latency_ms int,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index lab_call_events_call_idx on public.lab_call_events (call_id, id);

-- 3. Lab settings singleton
create table public.lab_settings (
  id text primary key default 'default',
  lab_assistant_id text,
  short_prompt text,
  router_model text not null default 'gpt-5.5-mini',
  confidence_threshold numeric not null default 0.7,
  injection_cooldown_ms int not null default 4000,
  trigger_response boolean not null default true,
  server_url_override text,
  updated_at timestamptz not null default now()
);
insert into public.lab_settings (id) values ('default');

-- RLS: permissive, matching the app's existing client-side-write tables
alter table public.listener_handlers enable row level security;
alter table public.lab_call_events enable row level security;
alter table public.lab_settings enable row level security;
create policy "allow all" on public.listener_handlers for all using (true) with check (true);
create policy "allow all" on public.lab_call_events for all using (true) with check (true);
create policy "allow all" on public.lab_settings for all using (true) with check (true);
