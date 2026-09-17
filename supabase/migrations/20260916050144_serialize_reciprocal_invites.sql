-- Serialize both directions of a friendship before checking reciprocal redemption.
-- PostgREST uses READ COMMITTED: the check after a waiting lock sees the committed invite.
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
  perform pg_advisory_xact_lock(hashtextextended(
    'invite-pair:' || least(uid, code_owner)::text || ':' || greatest(uid, code_owner)::text, 0
  ));
  -- Both directions hold the same lock until redemption and any reward commit.
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

revoke execute on function public.redeem_invite_code(text) from public, anon;
grant execute on function public.redeem_invite_code(text) to authenticated;
