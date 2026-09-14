import { billingReturn, cancel, portal, receiveStripeWebhook, subscribe, sync } from './billing.ts';
import { restoreComment } from './comments.ts';
import { finishConnect, instagramCallback, startConnect } from './connect.ts';
import { refreshTokens } from './cron.ts';
import { HttpError, json } from './http.ts';
import { pollComments } from './poll.ts';
import { receiveRevenueCatWebhook, syncAppStore } from './store.ts';
import { receiveInstagramWebhook, verifyInstagramSubscription } from './webhooks.ts';

// The app calls EXPO_PUBLIC_API_BASE_URL = https://<project>.supabase.co/functions/v1/api.
export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // The function sees its own name as the first path segment: /api/connect/start.
  const path = url.pathname.replace(/^(\/functions\/v1)?\/api(?=\/|$)/, '').replace(/\/+$/, '') || '/';

  try {
    switch (`${req.method} ${path}`) {
      case 'POST /connect/start':
        return await startConnect(req);
      case 'GET /connect/instagram/callback':
        return await instagramCallback(url);
      case 'POST /connect/finish':
        return await finishConnect(req);
      case 'POST /comments/restore':
        return await restoreComment(req);
      case 'GET /webhooks/instagram':
        return verifyInstagramSubscription(url);
      case 'POST /webhooks/instagram':
        return await receiveInstagramWebhook(req);
      case 'POST /cron/refresh-tokens':
        return await refreshTokens(req);
      case 'POST /cron/poll-comments':
        return await pollComments(req);
      case 'POST /billing/subscribe':
        return await subscribe(req);
      case 'POST /billing/sync':
        return await sync(req);
      case 'POST /billing/cancel':
        return await cancel(req);
      case 'POST /billing/portal':
        return await portal(req);
      case 'GET /billing/return':
        return billingReturn(url);
      case 'POST /webhooks/stripe':
        return await receiveStripeWebhook(req);
      case 'POST /billing/app-store/sync':
        return await syncAppStore(req);
      case 'POST /webhooks/revenuecat':
        return await receiveRevenueCatWebhook(req);
      default:
        return json({ error: 'Not found.' }, 404);
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(`${req.method} ${path} failed`, e);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}
