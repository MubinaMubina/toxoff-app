/**
 * The one-time code in the link Supabase sends the browser back to after Google sign-in.
 *
 * Supabase ends its redirect with a bare `#`. With a full address (Expo Go's
 * `exp://127.0.0.1:8081?code=…#`) that is an empty fragment and harmless. With the app's own
 * scheme the link comes back from iOS as `toxoff:?code=<uuid>%23`: the `#` has been encoded into
 * the code's value. Redeeming `<uuid>#` fails with "invalid flow state, no valid flow state
 * found", because the code no longer matches the one issued. So everything from a `#` on is
 * dropped, encoded or not.
 */
export function oauthCodeFromUrl(rawUrl: string): string | null {
  const query = rawUrl.split('?')[1];
  if (!query) return null;
  for (const pair of query.split('#')[0].split('&')) {
    const at = pair.indexOf('=');
    if (at < 0 || pair.slice(0, at) !== 'code') continue;
    let value = pair.slice(at + 1);
    try {
      value = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      return null;
    }
    const code = value.split('#')[0].trim();
    return code || null;
  }
  return null;
}
