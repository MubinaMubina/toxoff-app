-- toxoff — the reviewer login's sample comments now say which post they were on, in the same form
-- real ones use ("Reel · first line of the caption", supabase/functions/api/pipeline.ts), so the
-- Log's "Posted on" row isn't blank. Replaces seed_reviewer_demo() from 20260921100000; the rest of
-- that migration (columns, privileges, the daily job) is unchanged.

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
    (user_id, account_id, platform, username, text, reason, confidence, language, action, created_at, post_ref)
  select uid, acct, 'instagram', s.username, s.text, s.reason, s.confidence, s.language, s.action,
         now() - s.age, s.post_ref
  from (values
    ('hatekeyboard_warrior', 'You are absolutely disgusting and should not be allowed online 🤮', 'harassment',  0.97::real, 'en', 'deleted', interval '25 minutes', 'Reel · Morning routine that actually works'),
    ('crypto_promo_99',      'DM me to double your money in 24h 💰💰💰',                          'spam',        0.94::real, 'en', 'deleted', interval '2 hours', 'Reel · Morning routine that actually works'),
    ('rage_bait_22',         'this is the worst content I have ever seen, quit',                  'toxicity',    0.81::real, 'en', 'hidden',  interval '5 hours', 'Post · New studio tour'),
    ('anon_user_22',         'Eres una basura, nadie te quiere aquí',                             'harassment',  0.93::real, 'es', 'deleted', interval '9 hours', 'Post · New studio tour'),
    ('spam_shop_official',   'CHEAP designer bags link in bio 🔥 free followers too',             'spam',        0.96::real, 'en', 'deleted', interval '1 day 3 hours', 'Reel · Answering your questions'),
    ('troll_acct_99',        'back again with another L take 💀💀',                               'toxicity',    0.72::real, 'en', 'hidden',  interval '1 day 8 hours', 'Reel · Answering your questions'),
    ('mean_comment_acc',     'Du bist so hässlich, lösch dein Konto',                             'harassment',  0.92::real, 'de', 'deleted', interval '2 days 2 hours', 'Post · Behind the scenes'),
    ('spambot_4471',         'Get 10k FREE followers now 👉 scamlink.biz/claim',                  'spam',        0.98::real, 'en', 'deleted', interval '2 days 20 hours', 'Post · Behind the scenes'),
    ('toxic_troll_5',        'personne ne se soucie de toi, arrête',                              'harassment',  0.88::real, 'fr', 'hidden',  interval '3 days 5 hours', 'Reel · What I eat in a day'),
    ('random_hater',         'これは本当にひどい、消えてほしい',                                      'harassment',  0.86::real, 'ja', 'deleted', interval '4 days 1 hour', 'Reel · What I eat in a day'),
    ('gymrat_x',             'nobody asked for your opinion, just stop posting',                  'toxicity',    0.79::real, 'en', 'hidden',  interval '4 days 16 hours', 'Post · Weekend in Lisbon'),
    ('follow4follow_hub',    'Promote it on @growth.kings 🚀 instant followers',                  'spam',        0.95::real, 'en', 'deleted', interval '5 days 20 hours', 'Post · Weekend in Lisbon')
  ) as s(username, text, reason, confidence, language, action, age, post_ref);

  -- Past onboarding, with a believable part of the month's checks used.
  update public.profiles
     set onboarded_at       = coalesce(onboarded_at, now()),
         free_period_start  = public.free_period_start(coalesce(created_at, now())),
         free_comments_used = 14
   where id = uid;
end $$;

revoke execute on function public.seed_reviewer_demo(uuid) from public, anon, authenticated;
grant execute on function public.seed_reviewer_demo(uuid) to service_role;
