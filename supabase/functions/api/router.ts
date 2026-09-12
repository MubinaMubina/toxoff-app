import { restoreComment } from './comments.ts';
import { finishConnect, instagramCallback, startConnect } from './connect.ts';
import { refreshTokens } from './cron.ts';
import { HttpError, json } from './http.ts';
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
      default:
        return json({ error: 'Not found.' }, 404);
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(`${req.method} ${path} failed`, e);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}
