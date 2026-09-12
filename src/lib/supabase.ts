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

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'public-anon-placeholder-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // Google sign-in returns a one-time code that exchangeCodeForSession swaps for a session.
      flowType: 'pkce',
    },
  }
);
