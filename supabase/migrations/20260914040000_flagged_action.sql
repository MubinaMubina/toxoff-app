-- toxoff — what happens to a flagged comment is each user's choice (Filters screen): hide it
-- (the default; it can be restored) or delete it on the platform (permanent). The log records
-- which was done, so the app only offers Restore for hidden ones.

alter table public.filters
  add column if not exists flagged_action text not null default 'hide'
    check (flagged_action in ('hide', 'delete'));
grant update (flagged_action) on public.filters to authenticated;

alter table public.moderation_log
  add column if not exists action text not null default 'hidden'
    check (action in ('hidden', 'deleted'));
