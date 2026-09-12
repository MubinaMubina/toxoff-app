-- toxoff — daily Instagram token refresh. Calls the api function's /cron/refresh-tokens
-- (supabase/functions/api/cron.ts). The function URL and CRON_SECRET come from Vault, stored once
-- per project (README > Moderation backend):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/api', 'api_url');
--   select vault.create_secret('<same value as the CRON_SECRET function secret>', 'cron_secret');
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    create extension if not exists pg_net;
    perform cron.schedule(
      'refresh-instagram-tokens', '0 4 * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'api_url') || '/cron/refresh-tokens',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        timeout_milliseconds := 120000
      );
      $job$
    );
  end if;
end $$;
