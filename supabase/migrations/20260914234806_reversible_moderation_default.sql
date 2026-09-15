-- New profiles start with reversible moderation. Existing choices, including
-- explicitly enabled auto/delete modes, are preserved.
alter table public.filters alter column flagged_action set default 'hide';
