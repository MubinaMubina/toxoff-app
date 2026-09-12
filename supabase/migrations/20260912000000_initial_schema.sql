-- toxoff — initial Supabase schema. Applied with `npx supabase db push`.
-- Idempotent: it also upgrades a database created from the earlier schema.sql.
-- Later schema changes go in new files in supabase/migrations/.
-- Auth users live in auth.users; everything below keys off auth.uid().
--
-- Security model: RLS decides WHICH ROWS a signed-in user can touch (their own);
-- the GRANTs at the bottom decide WHICH OPERATIONS AND COLUMNS. Billing state,
-- platform tokens and the moderation log are written only by the backend
-- (service role), never directly by the app.

-- ---------- profiles ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text,
  plan         text check (plan in ('solo', 'plus')),
  trial_ends_at timestamptz,
  sub_status   text check (sub_status in ('trialing', 'active', 'none')) default 'none',
  region_code  text default 'PK',
  push_token   text,
  created_at   timestamptz default now()
);
alter table public.profiles
  add column if not exists notifications_enabled boolean not null default true;
alter table public.profiles   -- comments checked without paying (trial + Free); never resets
  add column if not exists free_comments_used int not null default 0;

-- ---------- connected social accounts ----------
create table if not exists public.accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  platform    text not null check (platform in ('instagram', 'tiktok')),
  handle      text not null,
  connected   boolean default true,   -- false = token expired/revoked, needs reconnect
  paused      boolean default false,
  created_at  timestamptz default now()
);

-- ---------- platform OAuth tokens (backend only — no app access at all) ----------
create table if not exists public.account_tokens (
  account_id    uuid primary key references public.accounts (id) on delete cascade,
  access_token  text not null,
  refresh_token text,
  expires_at    timestamptz,
  updated_at    timestamptz default now()
);

-- Earlier versions kept access_token on public.accounts, where the app could read it.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'accounts' and column_name = 'access_token'
  ) then
    insert into public.account_tokens (account_id, access_token)
      select id, access_token from public.accounts where access_token is not null
      on conflict (account_id) do nothing;
    alter table public.accounts drop column access_token;
  end if;
end $$;

-- ---------- moderation filter settings (one row per user) ----------
create table if not exists public.filters (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  sensitivity  text check (sensitivity in ('low', 'medium', 'high')) default 'medium',
  categories   jsonb default '{"hate_speech":true,"harassment":true,"slurs":true,"spam":true,"self_harm":true}',
  keywords     text[] default '{}',
  blocked_users text[] default '{}',
  updated_at   timestamptz default now()
);

-- ---------- removed comments log ----------
create table if not exists public.moderation_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  account_id  uuid references public.accounts (id) on delete set null,
  platform    text not null check (platform in ('instagram', 'tiktok')),
  username    text not null,
  text        text not null,
  reason      text not null check (reason in ('hate_speech','harassment','slurs','spam','self_harm','toxicity')),
  confidence  real not null default 0,
  language    text,
  post_ref    text,
  restored    boolean default false,
  created_at  timestamptz default now()
);

create index if not exists moderation_log_user_created_idx
  on public.moderation_log (user_id, created_at desc);
create index if not exists accounts_user_idx on public.accounts (user_id);

-- ---------- plan limits (server-side copy of src/data/plans.ts) ----------
create table if not exists public.plan_limits (
  plan              text primary key check (plan in ('free', 'solo', 'plus')),
  max_accounts      int     not null,
  keyword_blocklist boolean not null,
  blocked_users     boolean not null
);
alter table public.plan_limits drop column if exists monthly_comment_limit;
insert into public.plan_limits (plan, max_accounts, keyword_blocklist, blocked_users)
values
  ('free', 1, false, false),
  ('solo', 1, true,  false),
  ('plus', 5, true,  true)
on conflict (plan) do update set
  max_accounts      = excluded.max_accounts,
  keyword_blocklist = excluded.keyword_blocklist,
  blocked_users     = excluded.blocked_users;

-- The plan a user can use right now: an active subscription or unexpired trial, else Free.
-- Mirrored by toSubscription() in src/context/AuthContext.tsx.
create or replace function public.effective_plan(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when p.sub_status = 'active' then p.plan
      when p.sub_status = 'trialing' and p.trial_ends_at > now() then p.plan
    end
    from public.profiles p
    where p.id = uid
  ), 'free');
$$;

-- The moderation backend calls this before checking each comment; false = don't check it.
-- Paid plans are unlimited. Trial and Free share one allowance that never resets
-- (FREE_COMMENT_ALLOWANCE in src/data/plans.ts). The conditional UPDATE is atomic.
create or replace function public.consume_comment_check(uid uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  allowance constant int := 100;
  consumed  boolean;
begin
  if exists (select 1 from public.profiles where id = uid and sub_status = 'active') then
    return true;
  end if;
  update public.profiles
     set free_comments_used = free_comments_used + 1
   where id = uid and free_comments_used < allowance
  returning true into consumed;
  return coalesce(consumed, false);
end; $$;

-- Connecting accounts beyond the plan's limit fails no matter which code path inserts.
create or replace function public.enforce_account_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  max_allowed int;
  connected   int;
begin
  perform pg_advisory_xact_lock(hashtext('accounts:' || new.user_id::text));
  select max_accounts into max_allowed
    from public.plan_limits where plan = public.effective_plan(new.user_id);
  select count(*) into connected from public.accounts where user_id = new.user_id;
  if connected >= max_allowed then
    raise exception 'Your plan allows % connected account%. Upgrade to add more.',
      max_allowed, case when max_allowed = 1 then '' else 's' end;
  end if;
  return new;
end; $$;

drop trigger if exists accounts_enforce_limit on public.accounts;
create trigger accounts_enforce_limit
  before insert on public.accounts
  for each row execute function public.enforce_account_limit();

-- ---------- Row Level Security ----------
alter table public.profiles       enable row level security;
alter table public.accounts       enable row level security;
alter table public.account_tokens enable row level security; -- no policies: service role only
alter table public.filters        enable row level security;
alter table public.moderation_log enable row level security;
alter table public.plan_limits    enable row level security; -- no policies: service role only

drop policy if exists "own profile" on public.profiles;
drop policy if exists "own accounts" on public.accounts;
drop policy if exists "own filters" on public.filters;
drop policy if exists "own log" on public.moderation_log;

create policy "own profile"  on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own accounts" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own filters"  on public.filters
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own log"      on public.moderation_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Privileges ----------
-- Supabase grants anon/authenticated ALL on public tables by default. Replace that
-- with the minimum the app needs. The service role (backend) is unaffected.
revoke all on public.profiles, public.accounts, public.account_tokens,
              public.filters, public.moderation_log, public.plan_limits
  from anon, authenticated;
revoke execute on function public.effective_plan(uuid) from public, anon, authenticated;
revoke execute on function public.consume_comment_check(uuid) from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, region_code, push_token, notifications_enabled)
  on public.profiles to authenticated;  -- NOT plan / sub_status / trial_ends_at / free_comments_used

grant select, delete on public.accounts to authenticated;  -- connecting goes through the backend
grant update (paused) on public.accounts to authenticated;

grant select on public.filters to authenticated;
grant update (sensitivity, categories, keywords, blocked_users)
  on public.filters to authenticated;

grant select on public.moderation_log to authenticated;    -- restores go through the backend

-- ---------- signup: profile, default filters, and the 7-day Plus trial ----------
-- When the trial ends without a subscription, effective_plan() falls back to Free.
-- Trial length must match TRIAL_DAYS in src/data/plans.ts.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, plan, sub_status, trial_ends_at)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
      'plus',
      'trialing',
      now() + interval '7 days'
    )
    on conflict (id) do nothing;
  insert into public.filters (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Realtime: live "Recently removed" feed + free-checks meter ----------
do $$
declare
  t text;
begin
  foreach t in array array['moderation_log', 'profiles'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;  -- already added
      when undefined_object then null;  -- no realtime publication (e.g. plain Postgres)
    end;
  end loop;
end $$;
