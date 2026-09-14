-- toxoff — rate limit for the comment classifier (OpenAI moderation). Every comment the backend
-- checks takes one slot first, per user and in total, per minute. When the limit is reached the
-- comment isn't skipped: the claim is given back and it's checked on the next delivery or poll.

create table if not exists public.classifier_calls (
  scope   text not null,          -- a user id, or 'all' for the whole app
  minute  timestamptz not null,
  calls   int not null default 0,
  primary key (scope, minute)
);
alter table public.classifier_calls enable row level security; -- no policies: service role only
revoke all on public.classifier_calls from anon, authenticated;

-- true: go ahead and check the comment. false: over the limit this minute, try again later.
create or replace function public.take_classifier_call(uid uuid, per_user int, total int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  this_minute constant timestamptz := date_trunc('minute', now());
begin
  insert into public.classifier_calls as c (scope, minute, calls) values (uid::text, this_minute, 1)
    on conflict (scope, minute) do update set calls = c.calls + 1 where c.calls < per_user;
  if not found then
    return false;
  end if;
  insert into public.classifier_calls as c (scope, minute, calls) values ('all', this_minute, 1)
    on conflict (scope, minute) do update set calls = c.calls + 1 where c.calls < total;
  if not found then
    update public.classifier_calls set calls = calls - 1 where scope = uid::text and minute = this_minute;
    return false;
  end if;
  return true;
end; $$;

revoke execute on function public.take_classifier_call(uuid, int, int) from public, anon, authenticated;

-- The counters only matter for the current minute.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'prune-classifier-calls', '23 * * * *',
      $job$delete from public.classifier_calls where minute < now() - interval '1 hour'$job$
    );
  end if;
end $$;
