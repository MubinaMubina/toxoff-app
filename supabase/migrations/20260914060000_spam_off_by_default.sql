-- toxoff — the spam filter is off by default (the Filters screen turns it on). Spam scoring is
-- signal-based (links, "DM me", phone numbers) and catches some genuine comments, so it's opt-in.

alter table public.filters
  alter column categories
  set default '{"hate_speech":true,"harassment":true,"slurs":true,"spam":false,"self_harm":true}';

-- Nobody has changed the setting yet (it only ever had the old default), so everyone gets the new one.
update public.filters set categories = categories || '{"spam": false}'::jsonb
 where coalesce(categories->>'spam', 'true') = 'true';
