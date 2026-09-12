-- toxoff — moderation engine (supabase/functions/api).
-- Links each connected account to the platform's own id, lets the backend take on each incoming
-- comment exactly once (webhooks can arrive more than once), and records which platform comment
-- was hidden so it can be restored.

-- ---------- accounts: the platform's id for the account (webhooks are addressed by it) ----------
alter table public.accounts add column if not exists platform_user_id text;
-- One toxoff user per platform account, so each comment is moderated once.
create unique index if not exists accounts_platform_user_idx
  on public.accounts (platform, platform_user_id);

-- ---------- moderation_log: the hidden comment on the platform ----------
alter table public.moderation_log add column if not exists comment_id text;
create unique index if not exists moderation_log_comment_idx
  on public.moderation_log (platform, comment_id);

-- ---------- comments the backend has taken on ----------
create table if not exists public.comment_claims (
  platform    text not null check (platform in ('instagram', 'tiktok')),
  comment_id  text not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  counted     boolean not null default false,  -- spent one of the user's free comment checks
  created_at  timestamptz not null default now(),
  primary key (platform, comment_id)
);
alter table public.comment_claims enable row level security; -- no policies: service role only
revoke all on public.comment_claims from anon, authenticated;

-- Everything plan-related the backend needs to moderate a comment on one connected account.
-- within_plan: the account is among the oldest max_accounts of its owner's current plan
-- (the app's dashboard shows the rest as "Not moderated on <plan>").
create or replace function public.moderation_target(p_platform text, p_platform_user_id text)
returns table (
  account_id        uuid,
  user_id           uuid,
  handle            text,
  paused            boolean,
  connected         boolean,
  within_plan       boolean,
  plan              text,
  keyword_blocklist boolean,
  blocked_users     boolean
) language sql stable security definer set search_path = public as $$
  with target as (
    select * from public.accounts
    where platform = p_platform and platform_user_id = p_platform_user_id
  ), ranked as (
    select a.id, row_number() over (order by a.created_at, a.id) as position
    from public.accounts a
    where a.user_id = (select t.user_id from target t)
  )
  select t.id, t.user_id, t.handle, coalesce(t.paused, false), coalesce(t.connected, true),
         r.position <= l.max_accounts, l.plan, l.keyword_blocklist, l.blocked_users
  from target t
  join ranked r on r.id = t.id
  join public.plan_limits l on l.plan = public.effective_plan(t.user_id);
$$;

-- Takes on a comment before it is checked: 'duplicate' if it was already taken on,
-- 'no_checks_left' if the user's free comment checks are used up, else 'claimed'.
create or replace function public.claim_comment(uid uuid, p_platform text, p_comment_id text)
returns text language plpgsql security definer set search_path = public as $$
begin
  insert into public.comment_claims (platform, comment_id, user_id)
    values (p_platform, p_comment_id, uid)
    on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;
  if exists (select 1 from public.profiles where id = uid and sub_status = 'active') then
    return 'claimed';  -- paid plans are unlimited and not counted
  end if;
  if not public.consume_comment_check(uid) then
    return 'no_checks_left';
  end if;
  update public.comment_claims set counted = true
   where platform = p_platform and comment_id = p_comment_id;
  return 'claimed';
end; $$;

-- Undoes claim_comment when checking fails part-way, so the platform's retry is taken on again
-- and the user gets their free check back.
create or replace function public.release_comment(p_platform text, p_comment_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  released public.comment_claims;
begin
  delete from public.comment_claims
   where platform = p_platform and comment_id = p_comment_id
  returning * into released;
  if released.counted then
    update public.profiles set free_comments_used = greatest(free_comments_used - 1, 0)
     where id = released.user_id;
  end if;
end; $$;

revoke execute on function public.moderation_target(text, text) from public, anon, authenticated;
revoke execute on function public.claim_comment(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.release_comment(text, text) from public, anon, authenticated;

-- Claims only matter while the platform may still retry a delivery (Meta: up to 36 hours).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'prune-comment-claims', '17 3 * * *',
      $job$delete from public.comment_claims where created_at < now() - interval '7 days'$job$
    );
  end if;
end $$;
