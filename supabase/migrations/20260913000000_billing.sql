-- toxoff — subscriptions through Stripe (supabase/functions/api/billing.ts).
-- Stripe is the source of truth. Its webhooks, and the app right after checkout, make the backend
-- copy the user's current subscription onto their profile; the app only reads it.

-- ---------- each user's Stripe customer (backend only) ----------
create table if not exists public.stripe_customers (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  customer_id      text not null unique,
  subscription_id  text,  -- the current subscription; updates about older ones are ignored
  created_at       timestamptz not null default now()
);
alter table public.stripe_customers enable row level security; -- no policies: service role only
revoke all on public.stripe_customers from anon, authenticated;

-- ---------- the subscription, as the app shows it (readable by the app, written by the backend) ----------
-- billing_status: none       no subscription (never had one, cancelled or expired)
--                 scheduled  chosen during the trial: card saved, first charge when the trial ends
--                 active     paid up
--                 past_due   the last charge failed and Stripe is retrying; the plan stays on meanwhile
alter table public.profiles
  add column if not exists billing_status text not null default 'none'
    check (billing_status in ('none', 'scheduled', 'active', 'past_due')),
  add column if not exists billing_plan text check (billing_plan in ('solo', 'plus')),
  add column if not exists billing_interval text check (billing_interval in ('monthly', 'annual')),
  add column if not exists billing_period_end timestamptz,  -- next charge, or the end if cancelling
  add column if not exists billing_cancel_at_period_end boolean not null default false;

-- The plan a user can use right now. Mirrored by toSubscription() in src/context/AuthContext.tsx.
create or replace function public.effective_plan(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when p.sub_status = 'active' then p.plan
      when p.sub_status = 'trialing' and p.trial_ends_at > now() then p.plan
      -- Chosen during the trial: the first charge is due as the trial ends. Until Stripe reports it
      -- (a webhook, normally within a minute; failed deliveries are retried for 3 days), keep the
      -- chosen plan rather than dropping to Free.
      when p.billing_status = 'scheduled' and p.billing_period_end > now() - interval '3 days'
        then p.billing_plan
    end
    from public.profiles p
    where p.id = uid
  ), 'free');
$$;

-- Comments of subscribers aren't counted against the free comment checks, and neither are those of
-- someone who chose a plan during the trial (card saved, first charge when the trial ends).
create or replace function public.is_paying(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and (p.sub_status = 'active'
           or (p.billing_status = 'scheduled' and p.billing_period_end > now() - interval '3 days'))
  );
$$;

-- Same as before, with is_paying() deciding who is unlimited.
create or replace function public.consume_comment_check(uid uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  allowance constant int := 100;
  consumed  boolean;
begin
  if public.is_paying(uid) then
    return true;
  end if;
  update public.profiles
     set free_comments_used = free_comments_used + 1
   where id = uid and free_comments_used < allowance
  returning true into consumed;
  return coalesce(consumed, false);
end; $$;

create or replace function public.claim_comment(uid uuid, p_platform text, p_comment_id text)
returns text language plpgsql security definer set search_path = public as $$
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
  if not public.consume_comment_check(uid) then
    return 'no_checks_left';
  end if;
  update public.comment_claims set counted = true
   where platform = p_platform and comment_id = p_comment_id;
  return 'claimed';
end; $$;

-- Copies a Stripe subscription onto the profile. Returns false, changing nothing, when it isn't the
-- user's current subscription: a late update about one they replaced mustn't undo the new one.
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
    -- The plan in use is the subscription's while it's paid. When a paid one ends: the rest of the
    -- trial if there is any (the trial is always Plus, see handle_new_user), else Free. A scheduled
    -- one leaves the trial running until it ends. (Old values on the right: sub_status is pre-update.)
    plan = case
      when paid then p_plan
      when sub_status = 'active' then case when trial_ends_at > now() then 'plus' end
      else plan
    end,
    sub_status = case
      when paid then 'active'
      when sub_status = 'active' then case when trial_ends_at > now() then 'trialing' else 'none' end
      else sub_status
    end
  where id = uid;
  return true;
end; $$;

revoke execute on function public.is_paying(uuid) from public, anon, authenticated;
revoke execute on function public.apply_billing(uuid, text, text, text, text, timestamptz, boolean)
  from public, anon, authenticated;
