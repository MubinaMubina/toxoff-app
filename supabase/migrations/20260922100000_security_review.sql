-- toxoff — fixes from the 22 September 2026 security review. Prepared locally; push with db push.

-- ---------- 1. A comment claimed while a Free user was out of checks isn't lost for good ----------
-- claim_comment kept the claim row when consume_comment_check answered 'none', so once the user
-- earned checks (ad, invite, new month) or upgraded, the same comment came back as 'duplicate' and
-- was never moderated. Now the claim is given back, and a claim older than 15 minutes with no log
-- row (the function invocation died mid-comment) can be taken again.
create or replace function public.claim_comment(uid uuid, p_platform text, p_comment_id text)
returns text language plpgsql security definer set search_path = public as $$
declare
  spent text;
begin
  insert into public.comment_claims (platform, comment_id, user_id)
    values (p_platform, p_comment_id, uid)
    on conflict do nothing;
  if not found then
    -- A stale claim from an invocation that never finished: take it over.
    delete from public.comment_claims c
     where c.platform = p_platform and c.comment_id = p_comment_id
       and c.created_at < now() - interval '15 minutes'
       and not exists (select 1 from public.moderation_log l
                        where l.platform = p_platform and l.comment_id = p_comment_id);
    if not found then
      return 'duplicate';
    end if;
    insert into public.comment_claims (platform, comment_id, user_id) values (p_platform, p_comment_id, uid);
  end if;
  if public.is_paying(uid) then
    return 'claimed';  -- paid plans are unlimited and not counted
  end if;
  spent := public.consume_comment_check(uid);
  if spent = 'none' then
    delete from public.comment_claims where platform = p_platform and comment_id = p_comment_id;
    return 'no_checks_left';
  end if;
  update public.comment_claims set counted = true, counted_bonus = (spent = 'bonus')
   where platform = p_platform and comment_id = p_comment_id;
  return 'claimed';
end; $$;

-- ---------- 2. The reviewer login's sample account doesn't count against the plan limit ----------
create or replace function public.enforce_account_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  max_allowed int;
  connected   int;
begin
  if new.demo then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('accounts:' || new.user_id::text));
  select max_accounts into max_allowed
    from public.plan_limits where plan = public.effective_plan(new.user_id);
  select count(*) into connected from public.accounts where user_id = new.user_id and not demo;
  if connected >= max_allowed then
    raise exception 'Your plan allows % connected account%. Upgrade to add more.',
      max_allowed, case when max_allowed = 1 then '' else 's' end;
  end if;
  return new;
end; $$;

-- ---------- 3. Per-minute limit for app routes that spend third-party quota ----------
-- Same counters as the classifier limit (classifier_calls, pruned hourly). Scope is a route plus
-- the user id; false means "over the limit this minute".
create or replace function public.take_call(p_scope text, per_minute int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  this_minute constant timestamptz := date_trunc('minute', now());
begin
  insert into public.classifier_calls as c (scope, minute, calls) values (p_scope, this_minute, 1)
    on conflict (scope, minute) do update set calls = c.calls + 1 where c.calls < per_minute;
  return found;
end; $$;
revoke execute on function public.take_call(text, int) from public, anon, authenticated;

-- ---------- 4. Bounds on client-writable text, so one user's lists can't slow the shared pipeline ----------
alter table public.profiles drop constraint if exists profiles_text_len;
alter table public.profiles
  add constraint profiles_text_len check (
    length(full_name) <= 120 and length(region_code) <= 8 and length(push_token) <= 256);
alter table public.filters drop constraint if exists filters_list_len;
alter table public.filters
  add constraint filters_list_len check (
    cardinality(keywords) <= 500 and cardinality(blocked_users) <= 500
    and pg_column_size(categories) <= 2048);

-- ---------- 5. Hygiene ----------
-- The monthly allowance is anchored to created_at; a null would mean no checks at all.
update public.profiles set created_at = now() where created_at is null;
alter table public.profiles alter column created_at set not null;
-- A pure helper the app never needs to call.
revoke execute on function public.free_period_start(timestamptz, timestamptz) from authenticated;
-- The app subscribes to accounts updates ("needs reconnect"), which needs the table published.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'accounts') then
    alter publication supabase_realtime add table public.accounts;
  end if;
end $$;
