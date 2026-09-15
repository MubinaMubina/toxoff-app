import type { Session, User } from '@supabase/supabase-js';

export const PASSWORD_RECOVERY_REDIRECT = 'toxoff://reset-password';
export const PASSWORD_RECOVERY_STORAGE_KEY = 'toxoff:password-recovery-active';
export const RECOVERY_LINK_MESSAGE =
  'This reset link has expired or could not be verified. Request a new link and open it on the same device where you requested it.';
export const RECOVERY_CONNECTION_MESSAGE = 'Could not verify your reset link. Check your connection and try again.';

export type PasswordRecoveryState = 'idle' | 'verifying' | 'ready' | 'invalid' | 'complete';
export type RecoveryCallback = { kind: 'ignore' } | { kind: 'invalid' } | { kind: 'code'; code: string };

/** Only our dedicated native callback accepts codes. URL flags never authorize a password change. */
export function parseRecoveryCallback(rawUrl: string): RecoveryCallback {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: 'ignore' };
  }
  const path = `${url.hostname}${url.pathname}`.replace(/\/$/, '');
  if (url.protocol !== 'toxoff:' || !['reset-password', '/reset-password'].includes(path)) {
    return { kind: 'ignore' };
  }
  if (url.username || url.password || url.port) return { kind: 'invalid' };
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (['error', 'error_code', 'error_description'].some((key) => url.searchParams.has(key) || fragment.has(key))) {
    return { kind: 'invalid' };
  }
  // The app uses PKCE. Never turn arbitrary bearer tokens or `type=recovery` into a recovery session.
  if (['access_token', 'refresh_token', 'token_hash'].some((key) => url.searchParams.has(key) || fragment.has(key))) {
    return { kind: 'invalid' };
  }
  const codes = url.searchParams.getAll('code');
  if (codes.length !== 1 || !codes[0] || codes[0].length > 2048 || /\s/.test(codes[0]) || fragment.has('code')) {
    return { kind: 'invalid' };
  }
  return { kind: 'code', code: codes[0] };
}

type RecoverySession = Pick<Session, 'access_token' | 'expires_at'> & { user: Pick<User, 'id'> };

export function isVerifiedRecoverySession(
  recoveryEventSession: RecoverySession | null,
  exchangedSession: RecoverySession | null,
  verifiedUserId: string | null,
  now = Date.now()
): boolean {
  return Boolean(
    recoveryEventSession && exchangedSession && verifiedUserId &&
    recoveryEventSession.access_token === exchangedSession.access_token &&
    recoveryEventSession.user.id === exchangedSession.user.id &&
    verifiedUserId === exchangedSession.user.id &&
    exchangedSession.expires_at && exchangedSession.expires_at * 1000 > now
  );
}

/** Supabase usually resolves network failures in `error`, rather than rejecting the promise. */
export function isRetryableRecoveryError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('name' in error && error.name === 'AuthRetryableFetchError') return true;
  return 'status' in error && typeof error.status === 'number' && error.status >= 500 && error.status < 600;
}

export function passwordResetError(error: unknown, action: 'request' | 'update'): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
    return 'Please wait a minute before requesting another reset link.';
  }
  if (code === 'same_password') return 'Choose a password you have not used for this account before.';
  if (code === 'weak_password') return 'Choose a stronger password with a mix of letters, numbers, and symbols.';
  if (code === 'session_not_found' || code === 'refresh_token_not_found' || code === 'reauthentication_needed') {
    return RECOVERY_LINK_MESSAGE;
  }
  return action === 'request'
    ? 'We could not send a reset link. Check your connection and try again.'
    : 'We could not update your password. Check your connection and try again.';
}
