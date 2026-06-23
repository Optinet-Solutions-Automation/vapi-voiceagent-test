-- Listener Lab: handler groups (categorization label for organizing + filtering).
-- Run once in the Supabase dashboard SQL editor (project mfnebrospbqhbrxfexie).
-- ("group" is a reserved word, so the column is named group_name.)

alter table public.listener_handlers
  add column if not exists group_name text not null default '';

update public.listener_handlers set group_name = 'Greeting'
  where intent_key in ('first_message');

update public.listener_handlers set group_name = 'Compliance'
  where intent_key in ('gambling_problem', 'do_not_call');

update public.listener_handlers set group_name = 'Promotions'
  where intent_key in ('main_offer', 'upsell_offer');

update public.listener_handlers set group_name = 'SMS'
  where intent_key in ('sms_consent');

update public.listener_handlers set group_name = 'Objections'
  where intent_key in ('not_interested_soft', 'no_time', 'cant_act_now');

update public.listener_handlers set group_name = 'Q&A'
  where intent_key in (
    'wagering_requirements', 'minimum_deposit', 'where_find_spins', 'which_game',
    'website_url', 'claim_limit', 'how_got_number', 'deposit_in_progress'
  );

update public.listener_handlers set group_name = 'Support'
  where intent_key in ('login_help');

update public.listener_handlers set group_name = 'Closing'
  where intent_key in ('wrong_person', 'goodbye');
