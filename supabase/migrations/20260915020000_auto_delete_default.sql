-- toxoff — new users start on "auto" again: anything toxic the AI is at least 80% sure of is
-- deleted for good, the rest hidden (decided 2026-09-15; 20260914234806 had set 'hide'). Users
-- change it in Filters. Existing rows are left as they are.
alter table public.filters alter column flagged_action set default 'auto';
