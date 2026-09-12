import { safeEqual } from './crypto.ts';
import { db, markNeedsReconnect } from './db.ts';
import { env } from './env.ts';
import { json, text } from './http.ts';
import { InstagramError, refreshLongLivedToken } from './instagram.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_WITHIN_MS = 20 * DAY_MS;

// Runs daily (a Supabase cron job, see README). Instagram tokens last 60 days and can only be
// extended while still valid, so accounts left alone would otherwise stop being moderated.
export async function refreshTokens(req: Request): Promise<Response> {
  const given = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!safeEqual(given, env.cronSecret())) return text('Forbidden', 403);

  const { data, error } = await db()
    .from('account_tokens')
    .select('account_id, access_token, expires_at, updated_at, accounts!inner(platform, connected)')
    .eq('accounts.platform', 'instagram')
    .eq('accounts.connected', true)
    .lt('expires_at', new Date(Date.now() + REFRESH_WITHIN_MS).toISOString());
  if (error) throw error;

  const result = { refreshed: 0, needsReconnect: 0, failed: 0 };
  for (const row of data as { account_id: string; access_token: string; expires_at: string; updated_at: string }[]) {
    if (Date.parse(row.expires_at) <= Date.now()) {
      await markNeedsReconnect(row.account_id);
      result.needsReconnect++;
      continue;
    }
    // Instagram only refreshes tokens that are at least a day old.
    if (Date.parse(row.updated_at) > Date.now() - DAY_MS) continue;
    try {
      const token = await refreshLongLivedToken(row.access_token);
      const { error: updateError } = await db()
        .from('account_tokens')
        .update({ access_token: token.accessToken, expires_at: token.expiresAt, updated_at: new Date().toISOString() })
        .eq('account_id', row.account_id);
      if (updateError) throw updateError;
      result.refreshed++;
    } catch (e) {
      if (e instanceof InstagramError && e.tokenInvalid) {
        await markNeedsReconnect(row.account_id);
        result.needsReconnect++;
      } else {
        console.error(`Token refresh failed for account ${row.account_id}`, e);
        result.failed++;
      }
    }
  }
  return json(result);
}
