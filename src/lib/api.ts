import { supabase } from './supabase';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

// False in demo mode: callers simulate the backend instead of calling it.
export const isApiConfigured = Boolean(BASE_URL);

// The backend identifies the user from the bearer token, so bodies never carry user ids.
export async function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  if (!BASE_URL) throw new Error('Backend not configured (EXPO_PUBLIC_API_BASE_URL).');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('You are signed out. Log in and try again.');

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status}).`);
  return json as T;
}
