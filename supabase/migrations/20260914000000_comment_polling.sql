-- toxoff — polling Instagram for new comments (supabase/functions/api/poll.ts). Meta only sends
-- comment webhooks to apps that are Live with Advanced Access, so until then the api function
-- fetches new comments itself every 5 minutes. It only does so while the INSTAGRAM_POLLING
-- function secret is "on". Uses the same Vault secrets as the token refresh job.

-- Where the last poll got to, per account.
alter table public.accounts add column if not exists comments_polled_at timestamptz;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    create extension if not exists pg_net;
    perform cron.schedule(
      'poll-instagram-comments', '*/5 * * * *',
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
