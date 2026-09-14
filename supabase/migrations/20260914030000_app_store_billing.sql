-- toxoff — subscriptions bought in the iOS app with Apple's in-app purchase, through RevenueCat
-- (supabase/functions/api/store.ts). RevenueCat checks Apple's receipts and is the source of truth.
-- Its webhooks, and the app right after a purchase or restore, make the backend re-read the user's
-- subscription from RevenueCat and copy it onto the profile, the same way as Stripe's
-- (20260913000000_billing.sql), which the iOS app no longer uses.

-- Where the subscription on the profile comes from, so the app sends people to the right place to
-- manage it (Apple's subscriptions page, or Stripe's billing page).
alter table public.profiles
  add column if not exists billing_store text check (billing_store in ('stripe', 'app_store'));
update public.profiles set billing_store = 'stripe' where billing_status <> 'none' and billing_store is null;

-- Same as apply_billing, for the App Store. RevenueCat always reports the user's whole current
-- state, so there's no "is this the current subscription" check. A Stripe subscription isn't
-- ended by RevenueCat saying there's no App Store one.
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
    -- While it's paid, the plan is the subscription's (a purchase during the trial replaces it).
    -- When it ends: the rest of the trial if any is left, else Free. (sub_status is pre-update.)
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
  return found;
end; $$;

revoke execute on function public.apply_store_billing(uuid, text, text, text, timestamptz, boolean)
  from public, anon, authenticated;
