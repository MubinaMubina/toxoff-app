-- toxoff — onboarding. New users answer a few questions (app/onboarding.tsx) that set their filters
-- and the preferences below. Everything can be changed later in Filters and Settings.
--
--   persona            who they are; wording and the suggested plan follow it
--   onboarded_at       null until they finish (or skip) onboarding; the app sends them there first
--   log_visibility     what the Log and Home show: every comment's words ('all'), everything except
--                      deleted comments ('conceal_deleted', the default), or only counts ('count_only')
--   auto_erase_days    erase deleted comments from the log for good after this many days (null: never)
--   notification_mode  a push for every removed comment ('each', the default), one daily summary
--                      ('daily'), or none. notifications_enabled stays the on/off switch the
--                      backend checks; the app keeps it in step (mode 'none' = off).

alter table public.profiles
  add column if not exists persona text check (persona in ('creator', 'business', 'public_figure', 'manager')),
  add column if not exists onboarded_at timestamptz,
  add column if not exists log_visibility text not null default 'conceal_deleted'
    check (log_visibility in ('all', 'conceal_deleted', 'count_only')),
  add column if not exists auto_erase_days int check (auto_erase_days in (7, 30)),
  add column if not exists notification_mode text not null default 'each'
    check (notification_mode in ('each', 'daily', 'none'));

grant update (persona, onboarded_at, log_visibility, auto_erase_days, notification_mode)
  on public.profiles to authenticated;

-- ---------- auto-erase: the same as "Erase forever" in the Log, on a timer ----------
-- Deleted comments only (hidden ones can still be restored, so their text is still needed). The
-- rows stay, so Home's counts don't change; only the words and the author go.
create or replace function public.erase_old_deleted_comments()
returns int language sql security definer set search_path = public as $$
  with erased as (
    update public.moderation_log l
       set text = '', username = '', language = null, post_ref = null, erased_at = now()
      from public.profiles p
     where p.id = l.user_id
       and p.auto_erase_days is not null
       and l.action = 'deleted'
       and l.erased_at is null
       and l.created_at < now() - make_interval(days => p.auto_erase_days)
    returning l.id
  )
  select count(*)::int from erased;
$$;
revoke execute on function public.erase_old_deleted_comments() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('erase-old-deleted-comments', '40 3 * * *', 'select public.erase_old_deleted_comments()');
  end if;
end $$;

-- ---------- daily summary push (supabase/functions/api/cron.ts) ----------
-- 04:00 UTC is 9am in Pakistan, the launch market. Same Vault secrets as the other jobs.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    create extension if not exists pg_net;
    perform cron.schedule(
      'daily-summary-push', '0 4 * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'api_url') || '/cron/daily-summary',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        timeout_milliseconds := 120000
      );
      $job$
    );
  end if;
end $$;
