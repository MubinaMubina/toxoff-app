-- toxoff — faster comment polling (supabase/functions/api/poll.ts). The poll job now fires every
-- 30 seconds; each account is read on every run while it has a post younger than 2 hours and
-- every minute otherwise, in one Instagram request per read. Two columns back that decision.

-- When the account's newest post was made (from the last read): decides hot vs cool pace.
alter table public.accounts add column if not exists latest_post_at timestamptz;
-- Set when Meta answers "too many calls"; the account is left alone until then.
alter table public.accounts add column if not exists poll_backoff_until timestamptz;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    create extension if not exists pg_net;
    -- cron.schedule with an existing job name updates that job in place.
    perform cron.schedule(
      'poll-instagram-comments', '30 seconds',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'api_url') || '/cron/poll-comments',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        timeout_milliseconds := 120000
      );
      $job$
    );
  end if;
end $$;
