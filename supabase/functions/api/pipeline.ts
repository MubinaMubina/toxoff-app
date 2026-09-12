import { classify } from './classifier.ts';
import { db, markNeedsReconnect } from './db.ts';
import { env } from './env.ts';
import { type CommentEvent, getMedia, InstagramError, setCommentHidden } from './instagram.ts';
import { decide, type FilterSettings, type ModerationReason } from './moderation.ts';
import { sendPush } from './push.ts';

export type Outcome =
  | 'hidden'
  | 'kept'
  | 'duplicate' // this comment was already handled (webhooks can arrive twice)
  | 'no_checks_left' // trial/Free user used up their free comment checks
  | 'no_account' // no toxoff user has this Instagram account connected
  | 'own_comment'
  | 'paused'
  | 'needs_reconnect'
  | 'over_plan_limit' // account beyond the plan's limit (oldest accounts are moderated first)
  | 'comment_gone'; // deleted on Instagram before it could be hidden

type Target = {
  account_id: string;
  user_id: string;
  handle: string;
  paused: boolean;
  connected: boolean;
  within_plan: boolean;
  keyword_blocklist: boolean;
  blocked_users: boolean;
};

const REASON_LABEL: Record<ModerationReason, string> = {
  hate_speech: 'hate speech',
  harassment: 'harassment',
  slurs: 'a blocked word',
  spam: 'spam',
  self_harm: 'self-harm content',
  toxicity: 'toxicity',
};

const MEDIA_LABEL: Record<string, string> = { FEED: 'Post', REELS: 'Reel', STORY: 'Story', AD: 'Ad' };

/**
 * Checks one new Instagram comment and hides it if the user's filters say so.
 * Throws on temporary failures (classifier or Instagram down): the free check is given back and
 * the webhook answers with an error, so Meta delivers the comment again later.
 */
export async function moderateInstagramComment(event: CommentEvent): Promise<Outcome> {
  const { data, error } = await db().rpc('moderation_target', {
    p_platform: 'instagram',
    p_platform_user_id: event.accountId,
  });
  if (error) throw error;
  const target = (data as Target[])[0];
  if (!target) return 'no_account';
  if (event.authorId === event.accountId) return 'own_comment';
  if (target.paused) return 'paused';
  if (!target.connected) return 'needs_reconnect';
  if (!target.within_plan) return 'over_plan_limit';

  const [token, filters, profile] = await Promise.all([
    loadToken(target.account_id),
    loadFilters(target.user_id),
    loadProfile(target.user_id),
  ]);
  if (!token || (token.expires_at && Date.parse(token.expires_at) <= Date.now())) {
    await markNeedsReconnect(target.account_id);
    return 'needs_reconnect';
  }

  const { data: claim, error: claimError } = await db().rpc('claim_comment', {
    uid: target.user_id,
    p_platform: 'instagram',
    p_comment_id: event.commentId,
  });
  if (claimError) throw claimError;
  if (claim === 'duplicate' || claim === 'no_checks_left') return claim;

  const release = async () => {
    const { error } = await db().rpc('release_comment', {
      p_platform: 'instagram',
      p_comment_id: event.commentId,
    });
    if (error) console.error(`Could not release comment ${event.commentId}`, error);
  };

  try {
    const scores = await classify(event.text, env.openaiApiKey());
    // The keyword blocklist and blocked users are paid features; saved lists wait for an upgrade.
    const decision = decide(event.text, event.authorUsername, scores, {
      ...filters,
      keywords: target.keyword_blocklist ? filters.keywords : [],
      blockedUsers: target.blocked_users ? filters.blockedUsers : [],
    });
    if (!decision.remove || !decision.reason) return 'kept';

    try {
      await setCommentHidden(event.commentId, true, token.access_token);
    } catch (e) {
      if (e instanceof InstagramError && e.gone) return 'comment_gone';
      if (e instanceof InstagramError && e.tokenInvalid) {
        await markNeedsReconnect(target.account_id);
        await release(); // it wasn't moderated, so it doesn't use up a free check
        return 'needs_reconnect';
      }
      throw e;
    }

    const { data: logged, error: logError } = await db()
      .from('moderation_log')
      .upsert(
        {
          user_id: target.user_id,
          account_id: target.account_id,
          platform: 'instagram',
          comment_id: event.commentId,
          username: event.authorUsername,
          text: event.text,
          reason: decision.reason,
          confidence: decision.confidence,
          post_ref: await describePost(event, token.access_token),
        },
        { onConflict: 'platform,comment_id', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle();
    if (logError) throw logError;

    if (logged && profile?.notifications_enabled && profile.push_token) {
      const result = await sendPush(profile.push_token, {
        title: `Hid a comment on ${target.handle}`,
        body: `From @${event.authorUsername}, flagged for ${REASON_LABEL[decision.reason]}. Tap to review.`,
        data: { commentId: logged.id },
      });
      if (result === 'unregistered') {
        await db().from('profiles').update({ push_token: null }).eq('id', target.user_id);
      }
    }
    return 'hidden';
  } catch (e) {
    await release();
    throw e;
  }
}

async function loadToken(accountId: string) {
  const { data, error } = await db()
    .from('account_tokens')
    .select('access_token, expires_at')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) throw error;
  return data as { access_token: string; expires_at: string | null } | null;
}

async function loadFilters(userId: string): Promise<FilterSettings> {
  const { data, error } = await db()
    .from('filters')
    .select('sensitivity, categories, keywords, blocked_users')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return {
    sensitivity: data?.sensitivity ?? 'medium',
    categories: data?.categories ?? {},
    keywords: data?.keywords ?? [],
    blockedUsers: data?.blocked_users ?? [],
  };
}

async function loadProfile(userId: string) {
  const { data, error } = await db()
    .from('profiles')
    .select('notifications_enabled, push_token')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as { notifications_enabled: boolean; push_token: string | null } | null;
}

/** "Reel · Summer drop" for the log's "Posted on" row. */
async function describePost(event: CommentEvent, token: string): Promise<string | null> {
  if (!event.mediaId) return null;
  let type = event.mediaType;
  let caption: string | undefined;
  try {
    const media = await getMedia(event.mediaId, token);
    type = media.media_product_type ?? type;
    caption = media.caption;
  } catch {
    // Fall back to the post type from the webhook.
  }
  const label = MEDIA_LABEL[type ?? ''] ?? 'Post';
  const snippet = caption?.split('\n')[0].trim().slice(0, 40);
  return snippet ? `${label} · ${snippet}` : label;
}
