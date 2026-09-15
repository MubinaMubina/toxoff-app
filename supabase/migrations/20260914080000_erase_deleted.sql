-- toxoff — "Erase forever" for deleted comments. A comment the AI deleted is already gone from the
-- platform; the user shouldn't have to read it to get it out of their log. Erasing wipes the
-- comment's text and author from the row for good but keeps the row, so the counts on Home (comments
-- removed today / this week / this month) and the reason stay right. The app doesn't show erased
-- rows. Only the backend writes this (POST /comments/erase-deleted).

alter table public.moderation_log
  add column if not exists erased_at timestamptz;
