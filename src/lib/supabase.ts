import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Supabase handles auth + the moderation_log / accounts / filters tables.
 * See README and supabase/migrations for the database layout.
 *
 * If env vars are missing we still create a client with placeholder values so
 * the app boots in "demo mode" (mock data, no network). isSupabaseConfigured
 * lets the UI fall back gracefully instead of crashing.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

// Supabase's API now and then answers 502/503/504 ("Gateway Timeout"). Reads are tried once more;
// writes aren't, since the first attempt may have gone through. Same as the backend's db.ts.
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const res = await fetch(input, init);
  if ((method !== 'GET' && method !== 'HEAD') || ![502, 503, 504].includes(res.status)) return res;
  await new Promise((resolve) => setTimeout(resolve, 500));
  return fetch(input, init);
}

// || (not ??) so blank values in .env also fall back instead of crashing createClient.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'public-anon-placeholder-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // Google sign-in returns a one-time code that exchangeCodeForSession swaps for a session.
      flowType: 'pkce',
    },
    global: { fetch: fetchWithRetry },
  }
);
