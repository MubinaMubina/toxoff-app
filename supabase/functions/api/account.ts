import { db, requireUser } from './db.ts';
import { env } from './env.ts';
import { HttpError, json, readJson } from './http.ts';

// "Delete my account" in the app's Settings (App Store rule 5.1.1(v): deletion must be possible
// from inside the app). Deleting the auth user cascades through the database: profile, connected
// accounts and their Instagram tokens, filters, the moderation log, claims, billing and invites
// (see the foreign keys in supabase/migrations). What stays is documented on
// https://toxoff.app/delete-account.html: a one-way hash of each Instagram account ever connected
// (invite-abuse protection, no longer linked to anyone) and Apple's and RevenueCat's own records.
// An App Store subscription isn't cancelled by this; the app tells the user to cancel it in Apple's
// settings first.

/** The body must say confirm: true; a stray call from a bug must never delete anyone. */
export function requireConfirmation(body: Record<string, unknown>): void {
  if (body.confirm !== true) throw new HttpError(400, 'Confirmation missing.');
}

export async function deleteAccount(req: Request): Promise<Response> {
  const uid = await requireUser(req);
  requireConfirmation(await readJson(req));

  // RevenueCat keeps a subscriber record keyed by the toxoff user id; drop it when we can. The
  // key isn't set until the App Store is wired up, and a failure here must not block deletion.
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.revenuecatSecretKey()}` },
    });
    if (!res.ok && res.status !== 404) console.warn(`RevenueCat subscriber delete returned ${res.status}`);
  } catch (e) {
    console.warn('RevenueCat subscriber not deleted:', e instanceof Error ? e.message : e);
  }

  const { error } = await db().auth.admin.deleteUser(uid);
  if (error) throw error;
  return json({ deleted: true });
}
