-- toxoff — the default for flagged comments is now "auto": harassment the AI is at least 85% sure
-- of is deleted, everything else is hidden (chooseAction in supabase/functions/api/moderation.ts).
-- Users can still choose to hide everything or delete everything.

alter table public.filters drop constraint if exists filters_flagged_action_check;
alter table public.filters
  add constraint filters_flagged_action_check check (flagged_action in ('hide', 'auto', 'delete')),
  alter column flagged_action set default 'auto';

-- Nobody has chosen yet (the setting is new), so everyone gets the new default.
update public.filters set flagged_action = 'auto' where flagged_action = 'hide';
