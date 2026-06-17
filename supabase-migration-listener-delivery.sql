-- Listener Lab: per-handler delivery mode.
--   verbatim → the agent SPEAKS the response_template word-for-word (VAPI `say`)
--   reword   → the response_template is a [STAFF] briefing the agent rewords
-- Run once in the Supabase dashboard SQL editor (project mfnebrospbqhbrxfexie).

alter table public.listener_handlers
  add column if not exists delivery text not null default 'verbatim'
  check (delivery in ('verbatim', 'reword'));

-- ── Reword (adaptive / conversational — agent should adapt to the customer) ──
update public.listener_handlers set delivery = 'reword',
  response_template = $h$Acknowledge kindly without pushing. Offer once to text the details so they can look later; if they still decline, thank them warmly and wrap up.$h$
  where intent_key = 'not_interested_soft';

update public.listener_handlers set delivery = 'reword',
  response_template = $h$Respect their time right away. Offer to text the info so they can read it later, then wrap up quickly.$h$
  where intent_key = 'no_time';

update public.listener_handlers set delivery = 'reword',
  response_template = $h$Reassure them: they recently registered an account at Lucky7even.com, which is where the number came from. Then gently steer back to the conversation.$h$
  where intent_key = 'how_got_number';

update public.listener_handlers set delivery = 'reword',
  response_template = $h$Point them to the live chat support team on the website, or walk them through the reset-password option on the login page. Do not make account changes yourself.$h$
  where intent_key = 'login_help';

update public.listener_handlers set delivery = 'reword',
  response_template = $h$Congratulate them warmly and encourage them to stay active for more promotions, then move to wrap up.$h$
  where intent_key = 'deposit_in_progress';

-- ── Verbatim (exact wording matters — spoken word-for-word) ──
update public.listener_handlers set delivery = 'verbatim',
  response_template = $h$I really appreciate you telling me that, and I want you to know support is available — please do reach out to your local gambling helpline. Take good care of yourself. Goodbye.$h$
  where intent_key = 'gambling_problem';

update public.listener_handlers set delivery = 'verbatim',
  response_template = $h$I'm sorry for the interruption — I'll make sure we don't call you again. Thanks for your time, and goodbye.$h$
  where intent_key = 'do_not_call';

update public.listener_handlers set delivery = 'verbatim',
  response_template = $h$Great news — you've got twenty free spins waiting in your account already, no deposit needed. You just log in and activate them, and they're available today only. Would it be alright if I text you the details?$h$
  where intent_key = 'main_offer';

update public.listener_handlers set delivery = 'verbatim',
  response_template = $h$There's also an exclusive bonus — a three hundred percent match up to five hundred dollars on a deposit, with just a thirty dollar minimum. The twenty free spins themselves still need no deposit at all.$h$
  where intent_key = 'upsell_offer';

update public.listener_handlers set delivery = 'verbatim',
  response_template = $h$Perfect — I'll send that over to the number I reached you on right now. It'll have your free spins, plus one extra special treat you can claim.$h$
  where intent_key = 'sms_consent';

update public.listener_handlers set delivery = 'verbatim',
  response_template = $h$The wagering requirement is forty times the deposit.$h$
  where intent_key = 'wagering_requirements';

update public.listener_handlers set delivery = 'verbatim',
  response_template = $h$There's no deposit needed at all for the twenty free spins. The thirty dollar minimum only applies if you'd like the extra bonus offer.$h$
  where intent_key = 'minimum_deposit';

update public.listener_handlers set delivery = 'verbatim',
  response_template = $h$You'll find them under the notifications icon in the top right corner of the page. If you can't spot it, our live chat team can help you right away.$h$
  where intent_key = 'where_find_spins';

update public.listener_handlers set delivery = 'verbatim',
  response_template = $h$The game will be shown to you once the free spins appear in your account.$h$
  where intent_key = 'which_game';

update public.listener_handlers set delivery = 'verbatim',
  response_template = $h$The website is w w w dot lucky seven even dot com — that's lucky, the number seven, e-v-e-n, dot com.$h$
  where intent_key = 'website_url';

update public.listener_handlers set delivery = 'verbatim',
  response_template = $h$The offer can only be claimed once.$h$
  where intent_key = 'claim_limit';

update public.listener_handlers set delivery = 'verbatim',
  response_template = $h$No problem at all — I'll try again another time. Thanks, and have a great day!$h$
  where intent_key = 'wrong_person';

update public.listener_handlers set delivery = 'verbatim',
  response_template = $h$Thanks so much for your time today — have a wonderful day. Goodbye!$h$
  where intent_key = 'goodbye';

-- first_message stays verbatim (spoken as the opening line at call start)
update public.listener_handlers set delivery = 'verbatim' where intent_key = 'first_message';
