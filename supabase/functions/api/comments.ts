import { db, markNeedsReconnect, requireUser, throttle } from './db.ts';
import { HttpError, json, readJson } from './http.ts';
import { InstagramError, setCommentHidden } from './instagram.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Restore" in the app's log: un-hides the comment on Instagram, then marks the log row restored.
export async function restoreComment(req: Request): Promise<Response> {
  const uid = await requireUser(req);
  await throttle('restore', uid, 30);
  const { commentId } = await readJson(req);
  if (typeof commentId !== 'string' || !UUID.test(commentId)) {
    throw new HttpError(404, 'Comment not found.');
  }

  const { data: row, error } = await db()
    .from('moderation_log')
    .select('id, user_id, account_id, platform, comment_id, restored, action')
    .eq('id', commentId)
    .maybeSingle();
  if (error) throw error;
  if (!row || row.user_id !== uid) throw new HttpError(404, 'Comment not found.');
  if (row.restored) return json({ ok: true });
  if (row.action === 'deleted') {
    throw new HttpError(409, "This comment was deleted, so it can't be restored.");
  }
  // The reviewer login's sample comments (seed_reviewer_demo) aren't on Instagram: only the log changes.
  const sample = !row.comment_id && row.account_id ? await isDemoAccount(row.account_id) : false;
  if (!sample) await unhideOnInstagram(row);

  const { error: updateError } = await db()
    .from('moderation_log')
    .update({ restored: true })
    .eq('id', row.id);
  if (updateError) throw updateError;
  return json({ ok: true });
}

async function isDemoAccount(accountId: string): Promise<boolean> {
  const { data, error } = await db().from('accounts').select('demo').eq('id', accountId).maybeSingle();
  if (error) throw error;
  return data?.demo === true;
}

async function unhideOnInstagram(row: { platform: string; comment_id: string | null; account_id: string | null }) {
  if (row.platform !== 'instagram' || !row.comment_id || !row.account_id) {
    throw new HttpError(409, "This comment can't be restored from toxoff.");
  }

  const { data: token, error: tokenError } = await db()
    .from('account_tokens')
    .select('access_token')
    .eq('account_id', row.account_id)
    .maybeSingle();
  if (tokenError) throw tokenError;
  const reconnect = 'Reconnect this Instagram account in toxoff to restore its comments.';
  if (!token) throw new HttpError(409, reconnect);

  try {
    await setCommentHidden(row.comment_id, false, token.access_token);
  } catch (e) {
    if (e instanceof InstagramError && e.tokenInvalid) {
      await markNeedsReconnect(row.account_id);
      throw new HttpError(409, reconnect);
    }
    if (e instanceof InstagramError && e.gone) {
      throw new HttpError(410, "This comment was deleted on Instagram, so it can't be restored.");
    }
    console.error('Instagram unhide failed', e);
    throw new HttpError(502, "Instagram didn't respond. Please try again.");
  }
}

/** Rows to erase: every one of the user's deleted comments, or just the ids given. */
export function eraseSelection(body: Record<string, unknown>): string[] | null {
  if (body.commentIds === undefined) return null;
  if (!Array.isArray(body.commentIds) || body.commentIds.length === 0 || body.commentIds.length > 500) {
    throw new HttpError(400, 'Invalid comment list.');
  }
  for (const id of body.commentIds) {
    if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(404, 'Comment not found.');
  }
  return body.commentIds as string[];
}

/** What an erased log row keeps: the fact a comment was deleted, and why. The words are gone. */
export const ERASED = { text: '', username: '', language: null, post_ref: null } as const;

// "Erase forever" in the app's log: wipes the text and author of deleted comments from the log so
// the user never has to read them. The rows stay (erased_at set) so Home's counts are still right.
// Only deleted comments qualify: hidden ones can still be restored, so their text is still needed.
export async function eraseDeletedComments(req: Request): Promise<Response> {
  const uid = await requireUser(req);
  const ids = eraseSelection(await readJson(req));

  let query = db()
    .from('moderation_log')
    .update({ ...ERASED, erased_at: new Date().toISOString() })
    .eq('user_id', uid)
    .eq('action', 'deleted')
    .is('erased_at', null);
  if (ids) query = query.in('id', ids);
  const { data, error } = await query.select('id');
  if (error) throw error;
  return json({ erased: (data ?? []).map((r: { id: string }) => r.id) });
}
