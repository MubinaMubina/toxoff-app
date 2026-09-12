import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.ts';
import { HttpError } from './http.ts';

let client: SupabaseClient | undefined;

// Service-role client: it bypasses RLS, so every query must scope rows to the right user itself.
export function db(): SupabaseClient {
  client ??= createClient(env.supabaseUrl(), env.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
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

export async function markNeedsReconnect(accountId: string): Promise<void> {
  const { error } = await db().from('accounts').update({ connected: false }).eq('id', accountId);
  if (error) throw error;
}
