import { safeEqual, verifyHmacSha256 } from './crypto.ts';
import { env } from './env.ts';
import { json, text } from './http.ts';
import { commentEvents } from './instagram.ts';
import { moderateInstagramComment, RateLimitedError } from './pipeline.ts';

// Meta checks the callback URL once when webhooks are set up in the app dashboard.
export function verifyInstagramSubscription(url: URL): Response {
  const token = url.searchParams.get('hub.verify_token') ?? '';
  if (url.searchParams.get('hub.mode') === 'subscribe' && safeEqual(token, env.instagramVerifyToken())) {
    return text(url.searchParams.get('hub.challenge') ?? '');
  }
  return text('Forbidden', 403);
}

export async function receiveInstagramWebhook(req: Request): Promise<Response> {
  // Signed with the Instagram app secret; the Meta app's own secret (optional META_APP_SECRET)
  // is accepted too, in case deliveries come signed with that one.
  const secrets = [env.instagramAppSecret(), Deno.env.get('META_APP_SECRET')].filter(Boolean) as string[];
  // The signature covers the exact bytes Meta sent, so check it before parsing.
  const raw = await req.arrayBuffer();
  const signature = req.headers.get('X-Hub-Signature-256')?.replace(/^sha256=/, '') ?? '';
  let valid = false;
  for (const secret of secrets) valid ||= await verifyHmacSha256(secret, raw, signature);
  if (!valid) return text('Invalid signature', 401);

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return text('Invalid JSON', 400);
  }

  const events = commentEvents(payload);
  const results = await Promise.allSettled(events.map(moderateInstagramComment));
  const outcomes = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    if (r.reason instanceof RateLimitedError) return 'rate_limited';
    console.error(`Comment ${events[i].commentId} failed`, r.reason);
    return 'error';
  });
  // An error status makes Meta deliver the batch again later; handled comments come back as duplicates.
  const retry = outcomes.includes('error') || outcomes.includes('rate_limited');
  return json({ outcomes }, retry ? 500 : 200);
}
