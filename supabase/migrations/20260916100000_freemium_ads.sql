-- toxoff — no more trial. Everyone starts on a permanent Free plan: 50 comment checks a month
-- (counted from the monthly anniversary of the day they joined), plus a pool of extra checks
-- earned by watching rewarded ads (5 per ad, 2 ads a day; supabase/functions/api/ads.ts) and by
-- inviting friends (20260914020000_invites.sql). Paid plans are unlimited and show no ads.
-- Mirrored in src/data/plans.ts (FREE_CHECKS_PER_MONTH, AD_REWARD_CHECKS, AD_REWARDS_PER_DAY,
-- FREE_LOG_HISTORY_DAYS) and by toSubscription() / freePeriodStart() in the app.

-- ---------- the trial is gone ----------
update public.profiles set plan = null, sub_status = 'none' where sub_status = 'trialing';
alter table public.profiles drop constraint if exists profiles_sub_status_check;
alter table public.profiles
  add constraint profiles_sub_status_check check (sub_status in ('active', 'none'));
alter table public.profiles drop column if exists trial_ends_at;

-- New accounts: a profile and default filters, on Free.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
    on conflict (id) do nothing;
  insert into public.filters (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end; $$;

-- The plan a user can use right now: a paid subscription, else Free.
-- Mirrored by toSubscription() in src/context/AuthContext.tsx.
create or replace function public.effective_plan(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when p.sub_status = 'active' then p.plan
      -- Stripe only (dormant): the first charge is due; keep the plan while Stripe reports it.
      when p.billing_status = 'scheduled' and p.billing_period_end > now() - interval '3 days'
        then p.billing_plan
    end
    from public.profiles p
    where p.id = uid
  ), 'free');
$$;

-- Same as before (20260913000000_billing.sql) without the trial: when a paid plan ends, Free.
create or replace function public.apply_billing(
  uid                    uuid,
  p_subscription_id      text,
  p_status               text,
  p_plan                 text,
  p_interval             text,
  p_period_end           timestamptz,
  p_cancel_at_period_end boolean
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  paid constant boolean := p_status in ('active', 'past_due');
  gone constant boolean := p_status = 'none';
begin
  perform pg_advisory_xact_lock(hashtext('billing:' || uid::text));
  if not exists (
    select 1 from public.stripe_customers where user_id = uid and subscription_id = p_subscription_id
  ) then
    return false;
  end if;
  update public.profiles set
    billing_status               = p_status,
    billing_plan                 = case when gone then null else p_plan end,
    billing_interval             = case when gone then null else p_interval end,
    billing_period_end           = case when gone then null else p_period_end end,
    billing_cancel_at_period_end = not gone and p_cancel_at_period_end,
    plan       = case when paid then p_plan when sub_status = 'active' then null else plan end,
    sub_status = case when paid then 'active' when sub_status = 'active' then 'none' else sub_status end
  where id = uid;
  return true;
end; $$;

-- Same as before (20260914030000_app_store_billing.sql) without the trial.
create or replace function public.apply_store_billing(
  uid                    uuid,
  p_status               text,
  p_plan                 text,
  p_interval             text,
  p_period_end           timestamptz,
  p_cancel_at_period_end boolean
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  paid constant boolean := p_status in ('active', 'past_due');
  gone constant boolean := p_status = 'none';
begin
  if p_status not in ('none', 'active', 'past_due') then
    raise exception 'Unknown App Store billing status %', p_status;
  end if;
  perform pg_advisory_xact_lock(hashtext('billing:' || uid::text));
  if gone and exists (select 1 from public.profiles where id = uid and billing_store = 'stripe') then
    return false;
  end if;
  update public.profiles set
    billing_store                = case when gone then null else 'app_store' end,
    billing_status               = p_status,
    billing_plan                 = case when gone then null else p_plan end,
    billing_interval             = case when gone then null else p_interval end,
    billing_period_end           = case when gone then null else p_period_end end,
    billing_cancel_at_period_end = not gone and p_cancel_at_period_end,
    -- While it's paid, the plan is the subscription's. When it ends: Free. (sub_status is pre-update.)
    plan       = case when paid then p_plan when sub_status = 'active' then null else plan end,
    sub_status = case when paid then 'active' when sub_status = 'active' then 'none' else sub_status end
  where id = uid;
  return found;
end; $$;

-- ---------- what each plan gets ----------
-- monthly_checks: comment checks a month (null = unlimited). log_history_days: how far back the
-- app's log reaches (null = all of it). ads: whether the app shows ads.
alter table public.plan_limits
  add column if not exists monthly_checks   int,
  add column if not exists log_history_days int,
  add column if not exists ads              boolean not null default false;
update public.plan_limits set monthly_checks = 50,   log_history_days = 7,    ads = true  where plan = 'free';
update public.plan_limits set monthly_checks = null, log_history_days = null, ads = false where plan <> 'free';

-- ---------- the monthly allowance ----------
-- free_comments_used now counts the current month only; free_period_start says which month.
-- bonus_comment_checks is a pool of extra checks (invites, rewarded ads), spent after the month's
-- allowance and carried over. None of these are in the app's update grant.
alter table public.profiles
  add column if not exists free_period_start timestamptz not null default now();

-- The start of the user's current month: the latest monthly anniversary of joining at or before
-- p_now. Mirrored by freePeriodStart() in src/data/plans.ts.
create or replace function public.free_period_start(p_joined timestamptz, p_now timestamptz default now())
returns timestamptz language plpgsql stable as $$
declare
  months int := greatest(0, (extract(year from age(p_now, p_joined)) * 12 + extract(month from age(p_now, p_joined)))::int);
begin
  -- age() is approximate around month ends; settle on the anniversary at or before p_now.
  while p_joined + make_interval(months => months + 1) <= p_now loop months := months + 1; end loop;
  while months > 0 and p_joined + make_interval(months => months) > p_now loop months := months - 1; end loop;
  return p_joined + make_interval(months => months);
end; $$;

-- Everyone's counter starts fresh on the new rules.
update public.profiles
   set free_comments_used = 0,
       free_period_start  = public.free_period_start(coalesce(created_at, now()));

-- The moderation backend calls this before checking each comment: 'monthly' or 'bonus' says which
-- allowance paid for it, 'none' = don't check it. Paid plans are unlimited. The conditional
-- UPDATEs are atomic.
drop function if exists public.consume_comment_check(uuid);
create function public.consume_comment_check(uid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  allowance  int;
  joined     timestamptz;
  period     timestamptz;
  consumed   boolean;
begin
  if public.is_paying(uid) then
    return 'monthly';
  end if;
  select monthly_checks into allowance from public.plan_limits where plan = 'free';
  select created_at into joined from public.profiles where id = uid;
  if joined is null then
    return 'none';
  end if;
  period := public.free_period_start(joined);
  -- A new month starts the count again.
  update public.profiles set free_comments_used = 0, free_period_start = period
   where id = uid and free_period_start < period;
  update public.profiles set free_comments_used = free_comments_used + 1
   where id = uid and free_comments_used < allowance
  returning true into consumed;
  if consumed then
    return 'monthly';
  end if;
  update public.profiles set bonus_comment_checks = bonus_comment_checks - 1
   where id = uid and bonus_comment_checks > 0
  returning true into consumed;
  return case when consumed then 'bonus' else 'none' end;
end; $$;

-- Which allowance a claim spent, so release_comment() can give it back to the right one.
alter table public.comment_claims add column if not exists counted_bonus boolean not null default false;

create or replace function public.claim_comment(uid uuid, p_platform text, p_comment_id text)
returns text language plpgsql security definer set search_path = public as $$
declare
  spent text;
begin
  insert into public.comment_claims (platform, comment_id, user_id)
    values (p_platform, p_comment_id, uid)
    on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;
  if public.is_paying(uid) then
    return 'claimed';  -- paid plans are unlimited and not counted
  end if;
  spent := public.consume_comment_check(uid);
  if spent = 'none' then
    return 'no_checks_left';
  end if;
  update public.comment_claims set counted = true, counted_bonus = (spent = 'bonus')
   where platform = p_platform and comment_id = p_comment_id;
  return 'claimed';
end; $$;

create or replace function public.release_comment(p_platform text, p_comment_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  released public.comment_claims;
begin
  delete from public.comment_claims
   where platform = p_platform and comment_id = p_comment_id
  returning * into released;
  if released.counted and released.counted_bonus then
    update public.profiles set bonus_comment_checks = bonus_comment_checks + 1
     where id = released.user_id;
  elsif released.counted then
    update public.profiles set free_comments_used = greatest(free_comments_used - 1, 0)
     where id = released.user_id;
  end if;
end; $$;

-- ---------- rewarded ads ----------
-- One row per reward Google confirmed (its server-side verification callback, checked by the
-- backend). The app can read its own rows to show how many ads are left today; only the backend
-- writes them.
create table if not exists public.ad_rewards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  provider        text not null default 'admob',
  transaction_id  text not null,
  ad_unit         text,
  checks_granted  int  not null,
  created_at      timestamptz not null default now(),
  unique (provider, transaction_id)
);
create index if not exists ad_rewards_user_created_idx on public.ad_rewards (user_id, created_at desc);
alter table public.ad_rewards enable row level security;
drop policy if exists "own ad rewards" on public.ad_rewards;
create policy "own ad rewards" on public.ad_rewards for select using (auth.uid() = user_id);
revoke all on public.ad_rewards from anon, authenticated;
grant select on public.ad_rewards to authenticated;

-- Adds the reward for one verified ad view to the user's pool: 'granted', or 'duplicate' (this
-- view was already rewarded), 'limit' (today's ads are used up), 'paying' (nothing to gain),
-- 'unknown_user'. The amount is fixed here, never taken from the request.
create or replace function public.grant_ad_reward(uid uuid, p_transaction_id text, p_ad_unit text)
returns text language plpgsql security definer set search_path = public as $$
declare
  reward  constant int := 5;
  per_day constant int := 2;
  today   int;
begin
  if not exists (select 1 from public.profiles where id = uid) then
    return 'unknown_user';
  end if;
  perform pg_advisory_xact_lock(hashtext('ad-rewards:' || uid::text));
  if exists (select 1 from public.ad_rewards where provider = 'admob' and transaction_id = p_transaction_id) then
    return 'duplicate';
  end if;
  if public.is_paying(uid) then
    return 'paying';
  end if;
  select count(*) into today from public.ad_rewards
   where user_id = uid and created_at > now() - interval '1 day';
  if today >= per_day then
    return 'limit';
  end if;
  insert into public.ad_rewards (user_id, transaction_id, ad_unit, checks_granted)
    values (uid, p_transaction_id, p_ad_unit, reward);
  update public.profiles set bonus_comment_checks = bonus_comment_checks + reward where id = uid;
  return 'granted';
end; $$;

-- ---------- the log on Free reaches back 7 days ----------
-- Rows are kept; a paid plan brings them back. The app's totals (moderation_counts) still count them.
create or replace function public.log_visible_since()
returns timestamptz language sql stable security definer set search_path = public as $$
  select case
    when l.log_history_days is null then '-infinity'::timestamptz
    else now() - make_interval(days => l.log_history_days)
  end
  from public.plan_limits l
  where l.plan = public.effective_plan(auth.uid());
$$;

drop policy if exists "own log" on public.moderation_log;
create policy "own log" on public.moderation_log
  for all
  using (auth.uid() = user_id and created_at >= public.log_visible_since())
  with check (auth.uid() = user_id);

-- Home's activity counts, over the whole log regardless of plan.
create or replace function public.moderation_counts()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'today', count(*) filter (where created_at >= now() - interval '1 day'),
    'week',  count(*) filter (where created_at >= now() - interval '7 days'),
    'month', count(*) filter (where created_at >= now() - interval '30 days')
  )
  from public.moderation_log
  where user_id = auth.uid() and coalesce(restored, false) = false;
$$;

-- ---------- privileges ----------
revoke execute on function public.free_period_start(timestamptz, timestamptz) from public, anon;
revoke execute on function public.consume_comment_check(uuid) from public, anon, authenticated;
revoke execute on function public.grant_ad_reward(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.log_visible_since() from public, anon;
revoke execute on function public.moderation_counts() from public, anon;
grant execute on function public.log_visible_since() to authenticated;
grant execute on function public.moderation_counts() to authenticated;
