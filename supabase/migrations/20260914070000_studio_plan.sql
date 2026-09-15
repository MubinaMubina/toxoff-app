-- toxoff — the Studio plan (up to 15 accounts, for managers and small agencies) and the new prices.
-- Prices live in App Store Connect (list prices in src/data/pricing.ts); the database only knows
-- the plan ids and their limits. Plan ids are checked in three places, all widened here.

alter table public.plan_limits drop constraint if exists plan_limits_plan_check;
alter table public.plan_limits
  add constraint plan_limits_plan_check check (plan in ('free', 'solo', 'plus', 'studio'));

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check check (plan in ('solo', 'plus', 'studio'));

alter table public.profiles drop constraint if exists profiles_billing_plan_check;
alter table public.profiles
  add constraint profiles_billing_plan_check check (billing_plan in ('solo', 'plus', 'studio'));

-- Server-side copy of src/data/plans.ts.
insert into public.plan_limits (plan, max_accounts, keyword_blocklist, blocked_users)
values ('studio', 15, true, true)
on conflict (plan) do update set
  max_accounts      = excluded.max_accounts,
  keyword_blocklist = excluded.keyword_blocklist,
  blocked_users     = excluded.blocked_users;
