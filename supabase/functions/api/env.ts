import { HttpError } from './http.ts';

// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The rest are set with
// `npx supabase secrets set NAME=value` (README > Moderation backend).
function setting(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(503, `The server is missing the ${name} setting.`);
  return value;
}

export const env = {
  supabaseUrl: () => setting('SUPABASE_URL'),
  serviceRoleKey: () => setting('SUPABASE_SERVICE_ROLE_KEY'),
  instagramAppId: () => setting('INSTAGRAM_APP_ID'),
  instagramAppSecret: () => setting('INSTAGRAM_APP_SECRET'),
  instagramVerifyToken: () => setting('INSTAGRAM_WEBHOOK_VERIFY_TOKEN'),
  openaiApiKey: () => setting('OPENAI_API_KEY'),
  // Encrypts the OAuth state and the half-finished connection handed back to the app.
  connectSecret: () => setting('CONNECT_SECRET'),
  cronSecret: () => setting('CRON_SECRET'),
};
