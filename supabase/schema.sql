-- toxoff — Supabase schema
-- Run in the Supabase SQL editor (or via `supabase db push`).
-- Auth users live in auth.users; everything below keys off auth.uid().

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

-- ---------- connected social accounts ----------
create table if not exists public.accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  platform    text not null check (platform in ('instagram', 'tiktok')),
  handle      text not null,
  access_token text,          -- store encrypted / in Vault in production
  connected   boolean default true,
  paused      boolean default false,
  created_at  timestamptz default now()
);

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

-- ---------- Row Level Security ----------
alter table public.profiles       enable row level security;
alter table public.accounts       enable row level security;
alter table public.filters        enable row level security;
alter table public.moderation_log enable row level security;

create policy "own profile"  on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own accounts" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own filters"  on public.filters
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own log"      on public.moderation_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- auto-create profile + default filters on signup ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
    values (new.id, new.raw_user_meta_data ->> 'full_name');
  insert into public.filters (user_id) values (new.id);
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
