import { safeEqual } from './crypto.ts';
import { db, markNeedsReconnect } from './db.ts';
import { env } from './env.ts';
import { json, text } from './http.ts';
import { InstagramError, parseTime, polledCommentEvents, recentComments, recentMediaWithComments } from './instagram.ts';
import { moderateInstagramComment, RateLimitedError } from './pipeline.ts';

const POSTS = 5; // the newest posts are read; comments on older ones need webhooks
const OVERLAP_MS = 2 * 60_000; // re-reads a little; comments already taken on come back as duplicates
// Never further back than this, well inside the 7 days comment claims are kept, so a comment
// restored in the app isn't taken on (and hidden) again.
const MAX_LOOKBACK_MS = 2 * 24 * 60 * 60_000;

// How often each account is read. The cron job fires every 30 seconds; an account is read on a
// run only when it is due. Nearly every comment lands in the hours right after a post, so an
// account with a fresh post is read on every run and the rest every minute. Meta allows about 200
// calls per account per hour, and a read is one call (recentMediaWithComments), so the fast pace
// spends 120 and leaves room for hiding, deleting and post lookups.
export const HOT_WINDOW_MS = 2 * 60 * 60_000; // a post younger than this makes the account hot
export const HOT_INTERVAL_MS = 30_000;
export const COOL_INTERVAL_MS = 60_000;
export const RATE_LIMIT_BACKOFF_MS = 15 * 60_000; // after Meta says "too many calls"
const CONCURRENCY = 5; // accounts read at once, so a run stays well inside the 30 seconds

type Row = {
  account_id: string;
  access_token: string;
  expires_at: string | null;
  accounts: {
    handle: string;
    platform_user_id: string;
    created_at: string;
    comments_polled_at: string | null;
    latest_post_at: string | null;
    poll_backoff_until: string | null;
  };
};

export type PollSchedule = Pick<Row['accounts'], 'comments_polled_at' | 'latest_post_at' | 'poll_backoff_until'>;

/** Whether an account is read on this run. Never-read accounts and accounts with a fresh post first. */
export function pollDue(account: PollSchedule, now: number): boolean {
  if (account.poll_backoff_until && Date.parse(account.poll_backoff_until) > now) return false;
  if (!account.comments_polled_at) return true;
  const hot = account.latest_post_at ? now - Date.parse(account.latest_post_at) < HOT_WINDOW_MS : false;
  const interval = hot ? HOT_INTERVAL_MS : COOL_INTERVAL_MS;
  // A little slack, so a run that fires a second early still counts as on time.
  return now - Date.parse(account.comments_polled_at) >= interval - 5_000;
}

/** The newest post's time among the media read, for the hot/cool decision next run. */
export function latestPostAt(media: { timestamp?: string }[]): string | null {
  const times = media.map((m) => (m.timestamp ? parseTime(m.timestamp) : NaN)).filter((t) => Number.isFinite(t));
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

// Runs every 30 seconds (a Supabase cron job, see README). Meta only sends comment webhooks to apps
// that are Live with Advanced Access (after App Review); until then, and for any delivery that goes
// missing, new comments are fetched here and go through the same pipeline. INSTAGRAM_POLLING=on
// turns it on.
export async function pollComments(req: Request): Promise<Response> {
  const given = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!safeEqual(given, env.cronSecret())) return text('Forbidden', 403);
  if (Deno.env.get('INSTAGRAM_POLLING') !== 'on') return json({ skipped: 'INSTAGRAM_POLLING is off' });

  const { data, error } = await db()
    .from('account_tokens')
    .select(
      'account_id, access_token, expires_at, accounts!inner(handle, platform_user_id, created_at, comments_polled_at, latest_post_at, poll_backoff_until, platform)'
    )
    .eq('accounts.platform', 'instagram')
    .not('accounts.platform_user_id', 'is', null);
  if (error) throw error;

  const result: Record<string, number> = { accounts: 0, failed: 0 };
  const count = (key: string) => (result[key] = (result[key] ?? 0) + 1);

  const now = Date.now();
  const due = (data as unknown as Row[]).filter((row) => pollDue(row.accounts, now));
  result.waiting = data.length - due.length;

  // A few accounts at a time; a slow one doesn't hold the others.
  const queue = [...due];
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) await pollAccount(row, count);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return json(result);
}

async function pollAccount(row: Row, count: (key: string) => number): Promise<void> {
  const account = row.accounts;
  const started = Date.now();
  const markPolled = async (extra: Record<string, string | null> = {}) => {
    const { error } = await db()
      .from('accounts')
      .update({ comments_polled_at: new Date(started).toISOString(), ...extra })
      .eq('id', row.account_id);
    if (error) throw error;
  };

  // Paused, disconnected and over-the-limit accounts are skipped, as webhooks skip them; their
  // comments from that time aren't checked later either. A database hiccup here (Supabase has
  // answered "Gateway Timeout") fails just this account for this run.
  try {
    // A read-only function, so it's asked with GET and retried like other reads.
    const { data: target, error: targetError } = await db().rpc(
      'moderation_target',
      { p_platform: 'instagram', p_platform_user_id: account.platform_user_id },
      { get: true }
    );
    if (targetError) throw targetError;
    const t = (target as { paused: boolean; connected: boolean; within_plan: boolean }[])[0];
    if (!t || t.paused || !t.connected || !t.within_plan) {
      await markPolled();
      return;
    }
  } catch (e) {
    console.error(`Could not check account ${row.account_id}`, e);
    count('failed');
    return;
  }
  if (row.expires_at && Date.parse(row.expires_at) <= started) {
    await markNeedsReconnect(row.account_id);
    return;
  }

  count('accounts');
  const since = Math.max(
    account.comments_polled_at ? Date.parse(account.comments_polled_at) - OVERLAP_MS : Date.parse(account.created_at),
    started - MAX_LOOKBACK_MS
  );
  try {
    let failed = false;
    const media = await recentMediaWithComments(row.access_token, POSTS);
    posts: for (const post of media) {
      const comments = await recentComments(post.id, row.access_token, since, post.comments);
      const events = polledCommentEvents(
        { platformUserId: account.platform_user_id, handle: account.handle },
        post,
        comments,
        since
      );
      for (const event of events) {
        try {
          count(await moderateInstagramComment(event));
        } catch (e) {
          failed = true;
          if (e instanceof RateLimitedError) {
            count('rate_limited'); // the rest wait for the next poll too
            break posts;
          }
          console.error(`Comment ${event.commentId} failed`, e);
        }
      }
    }
    // After a temporary failure the same window is read again next time; the comments that
    // were handled come back as duplicates.
    if (failed) count('failed');
    else await markPolled({ latest_post_at: latestPostAt(media), poll_backoff_until: null });
  } catch (e) {
    if (e instanceof InstagramError && e.tokenInvalid) {
      await markNeedsReconnect(row.account_id);
      count('needs_reconnect');
    } else if (e instanceof InstagramError && e.rateLimited) {
      // Meta's limit is per account and per hour; leave this one alone for a while.
      const { error } = await db()
        .from('accounts')
        .update({ poll_backoff_until: new Date(started + RATE_LIMIT_BACKOFF_MS).toISOString() })
        .eq('id', row.account_id);
      if (error) console.error(`Could not back off account ${row.account_id}`, error);
      count('meta_rate_limited');
    } else {
      console.error(`Polling comments failed for account ${row.account_id}`, e);
      count('failed');
    }
  }
}
