-- toxoff — a login for app reviewers. Apple's reviewer can't connect an Instagram account (until
-- Meta's own review, only tester accounts can), so they would see an empty app. The reviewer login
-- (created by scripts/seed-reviewer.cjs) gets a sample Instagram account and sample comments
-- instead, refreshed every day so they stay inside the Free plan's 7-day log.

-- A sample account: no token, so it is never polled or refreshed, and the backend skips Instagram
-- when one of its comments is restored (supabase/functions/api/comments.ts).
alter table public.accounts add column if not exists demo boolean not null default false;
-- Marks the reviewer login. Only the backend sets it; users can read their own row but not write it.
alter table public.profiles add column if not exists reviewer boolean not null default false;

-- Puts the reviewer login back to its starting state: the sample account connected, and sample
-- comments from the last six days. Sample comments have no comment_id; anything real (a tester
-- Instagram account connected to this login) is left alone.
create or replace function public.seed_reviewer_demo(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  acct uuid;
begin
  if not exists (select 1 from public.profiles where id = uid and reviewer) then
    raise exception 'Not a reviewer login';
  end if;

  select id into acct from public.accounts where user_id = uid and demo order by created_at limit 1;
  if acct is null then
    insert into public.accounts (user_id, platform, handle, demo)
    values (uid, 'instagram', 'toxoff.demo', true)
    returning id into acct;
  else
    update public.accounts set connected = true, paused = false where id = acct;
  end if;

  delete from public.moderation_log where user_id = uid and comment_id is null;
  insert into public.moderation_log
    (user_id, account_id, platform, username, text, reason, confidence, language, action, created_at)
  select uid, acct, 'instagram', s.username, s.text, s.reason, s.confidence, s.language, s.action,
         now() - s.age
  from (values
    ('hatekeyboard_warrior', 'You are absolutely disgusting and should not be allowed online 🤮', 'harassment',  0.97::real, 'en', 'deleted', interval '25 minutes'),
    ('crypto_promo_99',      'DM me to double your money in 24h 💰💰💰',                          'spam',        0.94::real, 'en', 'deleted', interval '2 hours'),
    ('rage_bait_22',         'this is the worst content I have ever seen, quit',                  'toxicity',    0.81::real, 'en', 'hidden',  interval '5 hours'),
    ('anon_user_22',         'Eres una basura, nadie te quiere aquí',                             'harassment',  0.93::real, 'es', 'deleted', interval '9 hours'),
    ('spam_shop_official',   'CHEAP designer bags link in bio 🔥 free followers too',             'spam',        0.96::real, 'en', 'deleted', interval '1 day 3 hours'),
    ('troll_acct_99',        'back again with another L take 💀💀',                               'toxicity',    0.72::real, 'en', 'hidden',  interval '1 day 8 hours'),
    ('mean_comment_acc',     'Du bist so hässlich, lösch dein Konto',                             'harassment',  0.92::real, 'de', 'deleted', interval '2 days 2 hours'),
    ('spambot_4471',         'Get 10k FREE followers now 👉 scamlink.biz/claim',                  'spam',        0.98::real, 'en', 'deleted', interval '2 days 20 hours'),
    ('toxic_troll_5',        'personne ne se soucie de toi, arrête',                              'harassment',  0.88::real, 'fr', 'hidden',  interval '3 days 5 hours'),
    ('random_hater',         'これは本当にひどい、消えてほしい',                                      'harassment',  0.86::real, 'ja', 'deleted', interval '4 days 1 hour'),
    ('gymrat_x',             'nobody asked for your opinion, just stop posting',                  'toxicity',    0.79::real, 'en', 'hidden',  interval '4 days 16 hours'),
    ('follow4follow_hub',    'Promote it on @growth.kings 🚀 instant followers',                  'spam',        0.95::real, 'en', 'deleted', interval '5 days 20 hours')
  ) as s(username, text, reason, confidence, language, action, age);

  -- Past onboarding, with a believable part of the month's checks used.
  update public.profiles
     set onboarded_at       = coalesce(onboarded_at, now()),
         free_period_start  = public.free_period_start(coalesce(created_at, now())),
         free_comments_used = 14
   where id = uid;
end $$;

revoke execute on function public.seed_reviewer_demo(uuid) from public, anon, authenticated;
grant execute on function public.seed_reviewer_demo(uuid) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- cron.schedule with an existing job name updates that job in place.
    perform cron.schedule(
      'refresh-reviewer-demo', '17 2 * * *',
      $job$ select public.seed_reviewer_demo(id) from public.profiles where reviewer; $job$
    );
  end if;
end $$;
