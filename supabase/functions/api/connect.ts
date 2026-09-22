import { seal, unseal } from './crypto.ts';
import { db, requireUser } from './db.ts';
import { env, returnSchemes } from './env.ts';
import { HttpError, json, readJson, redirect, text } from './http.ts';
import * as instagram from './instagram.ts';

// Connecting an Instagram account (app: connectAccount in src/context/ModerationContext.tsx):
//   1. POST /connect/start       the app gets Instagram's consent URL
//   2. GET  /connect/instagram/callback
//                                Instagram sends the browser here; we fetch the account and its
//                                token and hand them back to the app, sealed, via the return URL
//   3. POST /connect/finish      the app sends that back with the user's session; only then is the
//                                account linked, so it can only be linked by the person who started

const TTL_MS = 10 * 60_000;
const COMMENTS_PERMISSION = 'instagram_business_manage_comments';

type ConnectState = { uid: string; returnUrl: string };
type PendingAccount = {
  uid: string;
  platformUserId: string;
  username: string;
  accessToken: string;
  expiresAt: string;
};

// Must match "Valid OAuth Redirect URIs" in the Meta app's Instagram settings.
const callbackUrl = () => `${env.supabaseUrl()}/functions/v1/api/connect/instagram/callback`;

export async function startConnect(req: Request): Promise<Response> {
  const uid = await requireUser(req);
  const { platform, returnUrl = 'toxoff://connect-accounts' } = await readJson(req);
  if (platform === 'tiktok') throw new HttpError(400, 'TikTok support is coming soon.');
  if (platform !== 'instagram') throw new HttpError(400, 'Unknown platform.');
  if (typeof returnUrl !== 'string' || !returnSchemes().some((s) => returnUrl.startsWith(s))) {
    throw new HttpError(400, 'Invalid return URL.');
  }
  const state = await seal('connect-state', { uid, returnUrl }, env.connectSecret(), TTL_MS);
  return json({ url: instagram.authorizeUrl(env.instagramAppId(), callbackUrl(), state) });
}

export async function instagramCallback(url: URL): Promise<Response> {
  const state = await unseal<ConnectState>(
    'connect-state',
    url.searchParams.get('state') ?? '',
    env.connectSecret()
  );
  if (!state) return text('This link has expired. Go back to toxoff and connect again.', 400);

  const backToApp = (params: Record<string, string>) => {
    const target = new URL(state.returnUrl);
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
    return redirect(target.toString());
  };
  const failed = 'Instagram did not connect. Please try again.';

  if (url.searchParams.get('error')) {
    return url.searchParams.get('error') === 'access_denied'
      ? backToApp({ cancelled: '1' })
      : backToApp({ error: failed });
  }
  const code = url.searchParams.get('code');
  if (!code) return backToApp({ error: failed });

  try {
    const short = await instagram.exchangeCode({
      appId: env.instagramAppId(),
      appSecret: env.instagramAppSecret(),
      redirectUri: callbackUrl(),
      code,
    });
    if (short.permissions.length && !short.permissions.includes(COMMENTS_PERMISSION)) {
      return backToApp({
        error: 'toxoff needs permission to manage your comments. Connect again and leave every permission on.',
      });
    }
    const token = await instagram.longLivedToken(env.instagramAppSecret(), short.accessToken);
    const profile = await instagram.getProfile(token.accessToken);
    const pending = await seal(
      'connect-pending',
      {
        uid: state.uid,
        platformUserId: profile.id,
        username: profile.username,
        accessToken: token.accessToken,
        expiresAt: token.expiresAt,
      },
      env.connectSecret(),
      TTL_MS
    );
    return backToApp({ pending });
  } catch (e) {
    console.error('Instagram connect failed', e);
    return backToApp({ error: failed });
  }
}

export async function finishConnect(req: Request): Promise<Response> {
  const uid = await requireUser(req);
  const { pending } = await readJson(req);
  const account =
    typeof pending === 'string'
      ? await unseal<PendingAccount>('connect-pending', pending, env.connectSecret())
      : null;
  if (!account || account.uid !== uid) {
    throw new HttpError(400, 'This connection expired. Please connect again.');
  }
  const handle = `@${account.username}`;

  // Comment webhooks only flow once the Meta app is Live with Advanced Access; until then Instagram
  // may refuse this, and comment polling (poll.ts) picks the account's comments up instead.
  try {
    await instagram.subscribeToComments(account.accessToken);
  } catch (e) {
    console.error(`Instagram webhook subscription failed for ${handle}; relying on polling`, e);
  }

  const { data: existing, error } = await db()
    .from('accounts')
    .select('id, user_id')
    .eq('platform', 'instagram')
    .eq('platform_user_id', account.platformUserId)
    .maybeSingle();
  if (error) throw error;
  const takenMessage = `${handle} is already connected to another toxoff account.`;
  if (existing && existing.user_id !== uid) throw new HttpError(409, takenMessage);

  let accountId: string;
  if (existing) {
    // Reconnecting: an update, so it doesn't count against the plan's account limit again.
    const { error: updateError } = await db()
      .from('accounts')
      .update({ handle, connected: true })
      .eq('id', existing.id);
    if (updateError) throw updateError;
    accountId = existing.id;
  } else {
    const { data: created, error: insertError } = await db()
      .from('accounts')
      .insert({ user_id: uid, platform: 'instagram', platform_user_id: account.platformUserId, handle })
      .select('id')
      .single();
    if (insertError?.code === '23505') throw new HttpError(409, takenMessage);
    // P0001: enforce_account_limit — "Your plan allows 1 connected account. Upgrade to add more."
    if (insertError?.code === 'P0001') throw new HttpError(403, insertError.message);
    if (insertError) throw insertError;
    accountId = created.id;
  }

  const { error: tokenError } = await db().from('account_tokens').upsert({
    account_id: accountId,
    access_token: account.accessToken,
    expires_at: account.expiresAt,
    updated_at: new Date().toISOString(),
  });
  if (tokenError) throw tokenError;

  return json({ account: { id: accountId, platform: 'instagram', handle } });
}
