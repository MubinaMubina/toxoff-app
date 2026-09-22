import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.ts';
import { HttpError } from './http.ts';

let client: SupabaseClient | undefined;

// Supabase's API now and then answers a request with 502/503/504 (seen: "Gateway Timeout" on the
// first query after the function starts). Reads are tried again; writes aren't, since the first
// attempt may have gone through (claiming a comment twice would skip it).
export async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const res = await fetch(input, init);
  if ((method !== 'GET' && method !== 'HEAD') || ![502, 503, 504].includes(res.status)) return res;
  await new Promise((resolve) => setTimeout(resolve, 500));
  return fetch(input, init);
}

// Service-role client: it bypasses RLS, so every query must scope rows to the right user itself.
export function db(): SupabaseClient {
  client ??= createClient(env.supabaseUrl(), env.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithRetry },
  });
  return client;
}

// App routes: the Supabase session token that src/lib/api.ts sends identifies the user.
export async function requireUser(req: Request): Promise<string> {
  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new HttpError(401, 'You are signed out. Log in and try again.');
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Log in and try again.');
  return data.user.id;
}

/** Per-user, per-minute limit for routes that call third-party APIs (take_call in the migrations). */
export async function throttle(route: string, uid: string, perMinute: number): Promise<void> {
  const { data, error } = await db().rpc('take_call', { p_scope: `${route}:${uid}`, per_minute: perMinute });
  if (error) throw error;
  if (!data) throw new HttpError(429, 'Too many requests. Please wait a minute and try again.');
}

export async function markNeedsReconnect(accountId: string): Promise<void> {
  const { error } = await db().from('accounts').update({ connected: false }).eq('id', accountId);
  if (error) throw error;
}
