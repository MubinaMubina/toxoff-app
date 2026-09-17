import { DEFAULT_MODEL } from './classifier.ts';
import { HttpError } from './http.ts';

// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The rest are set with
// `npx supabase secrets set NAME=value` (README > Moderation backend).
function setting(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(503, `The server is missing the ${name} setting.`);
  return value;
}

// Optional whole-number settings with a default.
function count(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const env = {
  supabaseUrl: () => setting('SUPABASE_URL'),
  serviceRoleKey: () => setting('SUPABASE_SERVICE_ROLE_KEY'),
  instagramAppId: () => setting('INSTAGRAM_APP_ID'),
  instagramAppSecret: () => setting('INSTAGRAM_APP_SECRET'),
  instagramVerifyToken: () => setting('INSTAGRAM_WEBHOOK_VERIFY_TOKEN'),
  openaiApiKey: () => setting('OPENAI_API_KEY'),
  // The GPT model that scores comments (classifier.ts); optional, defaults to gpt-5.4-nano.
  openaiModel: () => Deno.env.get('OPENAI_MODEL') || DEFAULT_MODEL,
  // Comment checks allowed per minute, per user and for the whole app (take_classifier_call).
  classifierLimitPerUser: () => count('CLASSIFIER_LIMIT_PER_USER', 60),
  classifierLimitTotal: () => count('CLASSIFIER_LIMIT_TOTAL', 600),
  // Encrypts the OAuth state and the half-finished connection handed back to the app.
  connectSecret: () => setting('CONNECT_SECRET'),
  cronSecret: () => setting('CRON_SECRET'),
  // RevenueCat (App Store subscriptions): the project's secret API key, and the Authorization header
  // value set on its webhook.
  revenuecatSecretKey: () => setting('REVENUECAT_SECRET_KEY'),
  revenuecatWebhookAuth: () => setting('REVENUECAT_WEBHOOK_AUTH'),
  // Enable only in isolated test deployments; sandbox purchases do not represent payment.
  revenuecatAllowSandbox: () => Deno.env.get('REVENUECAT_ALLOW_SANDBOX') === 'true',
  stripeSecretKey: () => setting('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: () => setting('STRIPE_WEBHOOK_SECRET'),
};
