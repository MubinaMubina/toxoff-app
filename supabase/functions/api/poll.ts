import { safeEqual } from './crypto.ts';
import { db, markNeedsReconnect } from './db.ts';
import { env } from './env.ts';
import { json, text } from './http.ts';
import { InstagramError, polledCommentEvents, recentComments, recentMedia } from './instagram.ts';
import { moderateInstagramComment, RateLimitedError } from './pipeline.ts';

const POSTS = 5; // the newest posts are read; comments on older ones need webhooks
const OVERLAP_MS = 10 * 60_000; // re-reads a few minutes; comments already taken on come back as duplicates
// Never further back than this, well inside the 7 days comment claims are kept, so a comment
// restored in the app isn't taken on (and hidden) again.
const MAX_LOOKBACK_MS = 2 * 24 * 60 * 60_000;

type Row = {
  account_id: string;
  access_token: string;
  expires_at: string | null;
  accounts: {
    handle: string;
    platform_user_id: string;
    created_at: string;
    comments_polled_at: string | null;
  };
};

// Runs every 5 minutes (a Supabase cron job, see README). Meta only sends comment webhooks to apps
// that are Live with Advanced Access (after App Review); until then, and for any delivery that goes
// missing, new comments are fetched here and go through the same pipeline. INSTAGRAM_POLLING=on
// turns it on.
export async function pollComments(req: Request): Promise<Response> {
  const given = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!safeEqual(given, env.cronSecret())) return text('Forbidden', 403);
  if (Deno.env.get('INSTAGRAM_POLLING') !== 'on') return json({ skipped: 'INSTAGRAM_POLLING is off' });

  const { data, error } = await db()
    .from('account_tokens')
    .select('account_id, access_token, expires_at, accounts!inner(handle, platform_user_id, created_at, comments_polled_at, platform)')
    .eq('accounts.platform', 'instagram')
    .not('accounts.platform_user_id', 'is', null);
  if (error) throw error;

  const result: Record<string, number> = { accounts: 0, failed: 0 };
  const count = (key: string) => (result[key] = (result[key] ?? 0) + 1);

  for (const row of data as unknown as Row[]) {
    const account = row.accounts;
    const started = Date.now();
    const markPolled = async () => {
      const { error } = await db()
        .from('accounts')
        .update({ comments_polled_at: new Date(started).toISOString() })
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
        continue;
      }
    } catch (e) {
      console.error(`Could not check account ${row.account_id}`, e);
      count('failed');
      continue;
    }
    if (row.expires_at && Date.parse(row.expires_at) <= started) {
      await markNeedsReconnect(row.account_id);
      continue;
    }

    result.accounts++;
    const since = Math.max(
      account.comments_polled_at
        ? Date.parse(account.comments_polled_at) - OVERLAP_MS
        : Date.parse(account.created_at),
      started - MAX_LOOKBACK_MS
    );
    try {
      let failed = false;
      posts: for (const media of await recentMedia(row.access_token, POSTS)) {
        const comments = await recentComments(media.id, row.access_token, since);
        const events = polledCommentEvents(
          { platformUserId: account.platform_user_id, handle: account.handle },
          media,
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
      else await markPolled();
    } catch (e) {
      if (e instanceof InstagramError && e.tokenInvalid) {
        await markNeedsReconnect(row.account_id);
        count('needs_reconnect');
      } else {
        console.error(`Polling comments failed for account ${row.account_id}`, e);
        count('failed');
      }
    }
  }
  return json(result);
}
