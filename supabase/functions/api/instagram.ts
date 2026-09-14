// Instagram API with Instagram Login (Business and Creator accounts).
// https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
const GRAPH = 'https://graph.instagram.com';
const VERSION = 'v23.0';
export const SCOPES = ['instagram_business_basic', 'instagram_business_manage_comments'];

export class InstagramError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: number,
    readonly subcode?: number
  ) {
    super(message);
  }
  /** The access token expired or was revoked: the user has to reconnect. */
  get tokenInvalid() {
    return this.code === 190;
  }
  /** The object is gone, e.g. the comment was deleted before we got to it. */
  get gone() {
    return this.code === 100 && this.subcode === 33;
  }
}

export type Token = { accessToken: string; expiresAt: string };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  // Graph errors are { error: {...} }; the OAuth endpoint's are flat { error_message, code }.
  const error = body?.error ?? (body?.error_message ? body : null);
  if (!res.ok || error) {
    throw new InstagramError(
      res.status,
      error?.message ?? error?.error_message ?? `Instagram returned ${res.status}`,
      error?.code,
      error?.error_subcode
    );
  }
  return body as T;
}

function graphUrl(path: string, params: Record<string, string>): string {
  const url = new URL(`${GRAPH}/${VERSION}/${path}`);
  url.search = new URLSearchParams(params).toString();
  return url.toString();
}

const toToken = (body: { access_token: string; expires_in: number }): Token => ({
  accessToken: body.access_token,
  expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
});

export function authorizeUrl(appId: string, redirectUri: string, state: string): string {
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(','),
    state,
    force_reauth: 'true', // so people can pick a different account when adding another one
  }).toString();
  return url.toString();
}

/** Swaps the consent screen's code for a short-lived (1 hour) token. */
export async function exchangeCode(p: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ accessToken: string; permissions: string[] }> {
  const body = await request<Record<string, any>>('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: p.appId,
      client_secret: p.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: p.redirectUri,
      code: p.code,
    }),
  });
  const token = body.data?.[0] ?? body; // documented as { data: [...] }; older responses were flat
  const permissions = Array.isArray(token.permissions)
    ? token.permissions
    : String(token.permissions ?? '').split(',').filter(Boolean);
  return { accessToken: token.access_token, permissions };
}

/** Swaps a short-lived token for a 60-day one. */
export async function longLivedToken(appSecret: string, shortToken: string): Promise<Token> {
  const url = new URL(`${GRAPH}/access_token`);
  url.search = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: appSecret,
    access_token: shortToken,
  }).toString();
  return toToken(await request(url.toString()));
}

/** Extends a 60-day token by another 60 days. It must be at least 24 hours old and unexpired. */
export async function refreshLongLivedToken(token: string): Promise<Token> {
  const url = new URL(`${GRAPH}/refresh_access_token`);
  url.search = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token }).toString();
  return toToken(await request(url.toString()));
}

/** user_id is the account id that webhooks are addressed to. */
export async function getProfile(token: string): Promise<{ id: string; username: string }> {
  const body = await request<{ user_id: string; username: string }>(
    graphUrl('me', { fields: 'user_id,username', access_token: token })
  );
  return { id: String(body.user_id), username: body.username };
}

/** Starts comment webhooks for the account behind `token`. */
export async function subscribeToComments(token: string): Promise<void> {
  await request(graphUrl('me/subscribed_apps', { subscribed_fields: 'comments', access_token: token }), {
    method: 'POST',
  });
}

export async function setCommentHidden(commentId: string, hidden: boolean, token: string): Promise<void> {
  await request(graphUrl(commentId, { hide: String(hidden), access_token: token }), { method: 'POST' });
}

/** Deletes a comment on the account's own post, for good. */
export async function deleteComment(commentId: string, token: string): Promise<void> {
  await request(graphUrl(commentId, { access_token: token }), { method: 'DELETE' });
}

export async function getMedia(
  mediaId: string,
  token: string
): Promise<{ caption?: string; media_product_type?: string }> {
  return request(graphUrl(mediaId, { fields: 'caption,media_product_type', access_token: token }));
}

// ---------- polling (poll.ts): used until Meta sends comment webhooks ----------

export type PolledMedia = { id: string; media_product_type?: string; timestamp?: string };
export type PolledComment = {
  id: string;
  text?: string;
  timestamp: string;
  hidden?: boolean;
  from?: { id?: string; username?: string };
  username?: string;
  replies?: { data?: PolledComment[] };
};

const COMMENT_FIELDS = 'id,text,timestamp,hidden,from,username';
const MAX_COMMENT_PAGES = 4;

/** Instagram writes "2026-09-14T10:00:00+0000"; the offset needs a colon to parse everywhere. */
export const parseTime = (timestamp: string) => Date.parse(timestamp.replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));

/** The account's newest posts. */
export async function recentMedia(token: string, limit: number): Promise<PolledMedia[]> {
  const body = await request<{ data?: PolledMedia[] }>(
    graphUrl('me/media', { fields: 'id,media_product_type,timestamp', limit: String(limit), access_token: token })
  );
  return body.data ?? [];
}

/**
 * A post's top-level comments, newest first, with their replies. Stops once a page reaches
 * comments older than `since` (the rest are older too). Replies only come with their top-level
 * comment, so a new reply under an older comment is only seen while that comment is in the pages read.
 */
export async function recentComments(mediaId: string, token: string, since: number): Promise<PolledComment[]> {
  const comments: PolledComment[] = [];
  let url: string | undefined = graphUrl(`${mediaId}/comments`, {
    fields: `${COMMENT_FIELDS},replies{${COMMENT_FIELDS}}`,
    limit: '50',
    access_token: token,
  });
  for (let page = 0; url && page < MAX_COMMENT_PAGES; page++) {
    const body: { data?: PolledComment[]; paging?: { next?: string } } = await request(url);
    const data = body.data ?? [];
    comments.push(...data);
    if (!data.length || data.some((c) => parseTime(c.timestamp) < since)) break;
    url = body.paging?.next;
  }
  return comments;
}

/**
 * The comments and replies worth checking: newer than `since`, not hidden yet (by toxoff or by
 * the owner), and not written by the account itself. Oldest first.
 */
export function polledCommentEvents(
  account: { platformUserId: string; handle: string },
  media: PolledMedia,
  comments: PolledComment[],
  since: number
): CommentEvent[] {
  const ownUsername = account.handle.replace(/^@/, '').toLowerCase();
  return comments
    .flatMap((c) => [c, ...(c.replies?.data ?? [])])
    .filter((c) => {
      const author = (c.from?.username ?? c.username ?? '').toLowerCase();
      return typeof c.text === 'string' && !c.hidden && parseTime(c.timestamp) >= since && author !== ownUsername;
    })
    .sort((a, b) => parseTime(a.timestamp) - parseTime(b.timestamp))
    .map((c) => ({
      accountId: account.platformUserId,
      commentId: String(c.id),
      text: c.text as string,
      authorId: c.from?.id ? String(c.from.id) : null,
      authorUsername: c.from?.username ?? c.username ?? 'unknown',
      mediaId: media.id,
      mediaType: media.media_product_type ?? null,
    }));
}

export type CommentEvent = {
  accountId: string; // the Instagram account whose post got the comment
  commentId: string;
  text: string;
  authorId: string | null;
  authorUsername: string;
  mediaId: string | null;
  mediaType: string | null; // FEED, REELS, STORY, AD
};

/** New comments (and replies) in a `comments` webhook delivery. */
export function commentEvents(payload: unknown): CommentEvent[] {
  const p = payload as { object?: string; entry?: any[] };
  if (p?.object !== 'instagram' || !Array.isArray(p.entry)) return [];
  return p.entry.flatMap((entry) =>
    (Array.isArray(entry?.changes) ? entry.changes : [])
      .filter((c: any) => c?.field === 'comments' && c.value?.id && typeof c.value.text === 'string')
      .map((c: any) => ({
        accountId: String(entry.id),
        commentId: String(c.value.id),
        text: c.value.text,
        authorId: c.value.from?.id ? String(c.value.from.id) : null,
        authorUsername: c.value.from?.username ?? 'unknown',
        mediaId: c.value.media?.id ? String(c.value.media.id) : null,
        mediaType: c.value.media?.media_product_type ?? null,
      }))
  );
}
