import { db, markNeedsReconnect, requireUser } from './db.ts';
import { HttpError, json, readJson } from './http.ts';
import { InstagramError, setCommentHidden } from './instagram.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Restore" in the app's log: un-hides the comment on Instagram, then marks the log row restored.
export async function restoreComment(req: Request): Promise<Response> {
  const uid = await requireUser(req);
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

  const { error: updateError } = await db()
    .from('moderation_log')
    .update({ restored: true })
    .eq('id', row.id);
  if (updateError) throw updateError;
  return json({ ok: true });
}
