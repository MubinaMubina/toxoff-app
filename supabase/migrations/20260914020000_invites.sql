-- toxoff — 20 free comment checks (was 100), plus invites. Everyone has a single-use invite code.
-- When a friend enters it and connects an Instagram account that no toxoff user has connected
-- before, both of them get 5 more free checks. Up to 3 rewarded invites per person.
-- Mirrored in src/data/plans.ts (FREE_COMMENT_ALLOWANCE, INVITE_BONUS, MAX_INVITE_REWARDS).

-- ---------- extra free checks earned by invites ----------
-- Not in the app's update grant (initial schema): only the functions below change it.
alter table public.profiles add column if not exists bonus_comment_checks int not null default 0;

-- Same as before (billing migration), with an allowance of 20 plus the invite bonus.
create or replace function public.consume_comment_check(uid uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  allowance constant int := 20;
  consumed  boolean;
begin
  if public.is_paying(uid) then
    return true;
  end if;
  update public.profiles
     set free_comments_used = free_comments_used + 1
   where id = uid and free_comments_used < allowance + bonus_comment_checks
  returning true into consumed;
  return coalesce(consumed, false);
end; $$;

-- ---------- platform accounts ever connected ----------
-- Kept after an account is disconnected or its owner deletes toxoff, so re-linking the same
-- Instagram from a second toxoff account never earns an invite reward. Only a hash is stored.
create table if not exists public.platform_accounts_seen (
  platform       text not null,
  account_hash   text not null,
  first_user_id  uuid references auth.users (id) on delete set null,
  first_seen_at  timestamptz not null default now(),
  primary key (platform, account_hash)
);
alter table public.platform_accounts_seen enable row level security; -- no policies: service role only
revoke all on public.platform_accounts_seen from anon, authenticated;

create or replace function public.platform_account_hash(p_platform text, p_platform_user_id text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(p_platform || ':' || p_platform_user_id, 'UTF8')), 'hex');
$$;

insert into public.platform_accounts_seen (platform, account_hash, first_user_id, first_seen_at)
  select platform, public.platform_account_hash(platform, platform_user_id), user_id, created_at
    from public.accounts where platform_user_id is not null
  on conflict do nothing;

-- ---------- invite codes ----------
create table if not exists public.invite_codes (
  code         text primary key,
  owner_id     uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  redeemed_by  uuid unique references auth.users (id) on delete set null, -- one code per friend
  redeemed_at  timestamptz,
  rewarded_at  timestamptz -- both got their extra checks
);
create index if not exists invite_codes_owner_idx on public.invite_codes (owner_id);
alter table public.invite_codes enable row level security; -- no policies: read through invite_status()
revoke all on public.invite_codes from anon, authenticated;

-- 8 characters without look-alikes (no 0/O, 1/I). The random bytes of a v4 UUID.
create or replace function public.new_invite_code()
returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', get_byte(r.b, i) % 32 + 1, 1), '' order by i)
    from (select uuid_send(gen_random_uuid()) as b) r, unnest(array[0, 1, 2, 3, 4, 5, 10, 11]) as i;
$$;

-- Gives both people their extra checks once the friend has redeemed a code and connected an
-- account nobody connected before. The friend always gets theirs; the owner only up to the cap.
create or replace function public.grant_invite_reward(friend uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  bonus       constant int := 5;
  max_rewards constant int := 3;
  invite      public.invite_codes;
  rewarded    int;
begin
  select * into invite from public.invite_codes
   where redeemed_by = friend and rewarded_at is null;
  if not found then
    return false;
  end if;
  if not exists (select 1 from public.platform_accounts_seen where first_user_id = friend) then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext('invites:' || invite.owner_id::text));
  update public.invite_codes set rewarded_at = now()
   where code = invite.code and rewarded_at is null;
  if not found then
    return false; -- rewarded in the meantime
  end if;
  select count(*) into rewarded from public.invite_codes
   where owner_id = invite.owner_id and rewarded_at is not null;
  update public.profiles set bonus_comment_checks = bonus_comment_checks + bonus where id = friend;
  if rewarded <= max_rewards then
    update public.profiles set bonus_comment_checks = bonus_comment_checks + bonus where id = invite.owner_id;
  end if;
  return true;
end; $$;

-- Every newly linked platform account is noted; the first time one is seen, it may complete an invite.
create or replace function public.note_connected_account()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.platform_user_id is not null then
    insert into public.platform_accounts_seen (platform, account_hash, first_user_id)
      values (new.platform, public.platform_account_hash(new.platform, new.platform_user_id), new.user_id)
      on conflict do nothing;
    perform public.grant_invite_reward(new.user_id);
  end if;
  return new;
end; $$;

drop trigger if exists accounts_note_connected on public.accounts;
create trigger accounts_note_connected
  after insert on public.accounts
  for each row execute function public.note_connected_account();

-- The app's invite screen: the signed-in user's unused code (made on first ask), how many friends
-- have joined, and whether they can still enter a friend's code (new accounts only).
create or replace function public.invite_status()
returns json language plpgsql security definer set search_path = public as $$
declare
  max_rewards constant int := 3;
  uid         constant uuid := auth.uid();
  rewarded    int;
  pending     int;
  unused_code text;
  joined      timestamptz;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  perform pg_advisory_xact_lock(hashtext('invites:' || uid::text));
  -- Pending: redeemed, but the friend hasn't connected Instagram yet (counts for a week).
  select count(*) filter (where rewarded_at is not null),
         count(*) filter (where rewarded_at is null and redeemed_at > now() - interval '7 days')
    into rewarded, pending
    from public.invite_codes where owner_id = uid;
  select code into unused_code from public.invite_codes
   where owner_id = uid and redeemed_at is null
   order by created_at limit 1;
  if unused_code is null and rewarded + pending < max_rewards then
    loop
      unused_code := public.new_invite_code();
      begin
        insert into public.invite_codes (code, owner_id) values (unused_code, uid);
        exit;
      exception when unique_violation then
        -- taken: draw another
      end;
    end loop;
  end if;
  if rewarded >= max_rewards then
    unused_code := null; -- all extra checks earned: nothing more to share
  end if;
  select created_at into joined from auth.users where id = uid;
  return json_build_object(
    'code', unused_code,
    'rewarded', rewarded,
    'pending', pending,
    'max', max_rewards,
    'canRedeem', joined > now() - interval '7 days'
                 and not exists (select 1 from public.invite_codes where redeemed_by = uid)
  );
end; $$;

-- A new user enters a friend's code. 'pending' until they connect an account nobody connected
-- before; 'rewarded' if they already have.
create or replace function public.redeem_invite_code(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid    constant uuid := auth.uid();
  clean  constant text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  code_owner uuid;
  joined timestamptz;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if exists (select 1 from public.invite_codes where redeemed_by = uid) then
    return 'already_redeemed';
  end if;
  select created_at into joined from auth.users where id = uid;
  if joined < now() - interval '7 days' then
    return 'too_late';
  end if;
  select owner_id into code_owner from public.invite_codes where code = clean;
  if code_owner is null then
    return 'not_found';
  end if;
  if code_owner = uid then
    return 'own_code';
  end if;
  -- Two people swapping codes would earn twice for one friendship.
  if exists (select 1 from public.invite_codes where owner_id = uid and redeemed_by = code_owner) then
    return 'invited_you';
  end if;
  update public.invite_codes set redeemed_by = uid, redeemed_at = now()
   where code = clean and redeemed_at is null;
  if not found then
    return 'used';
  end if;
  if public.grant_invite_reward(uid) then
    return 'rewarded';
  end if;
  return 'pending';
exception when unique_violation then
  return 'already_redeemed';
end; $$;

revoke execute on function public.new_invite_code() from public, anon, authenticated;
revoke execute on function public.grant_invite_reward(uuid) from public, anon, authenticated;
revoke execute on function public.note_connected_account() from public, anon, authenticated;
revoke execute on function public.platform_account_hash(text, text) from public, anon, authenticated;
revoke execute on function public.invite_status() from public, anon;
revoke execute on function public.redeem_invite_code(text) from public, anon;
grant execute on function public.invite_status() to authenticated;
grant execute on function public.redeem_invite_code(text) to authenticated;
