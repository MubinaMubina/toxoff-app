-- toxoff — new accounts start on the strictest settings: High sensitivity, and every flagged
-- comment deleted for good (was Medium, and "auto": delete clear abuse, hide the rest). Both can be
-- changed in onboarding and in Filters. Existing accounts keep what they have.
-- Mirrored by src/data/moderationDefaults.ts and loadFilters() in supabase/functions/api/pipeline.ts.
alter table public.filters alter column sensitivity    set default 'high';
alter table public.filters alter column flagged_action set default 'delete';
