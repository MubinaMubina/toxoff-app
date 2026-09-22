import { safeEqual } from './crypto.ts';
import { db, requireUser, throttle } from './db.ts';
import { env } from './env.ts';
import { HttpError, json, text } from './http.ts';

// Subscriptions bought in the iOS app with Apple's in-app purchase (app: src/lib/purchases.ts).
// RevenueCat checks Apple's receipts and knows each user by their toxoff user id (the app logs in
// to RevenueCat with it). Whenever the subscription may have changed, the backend re-reads the
// user from RevenueCat and copies it onto their profile (public.apply_store_billing):
//   POST /billing/app-store/sync   the app, right after a purchase or restore
//   POST /webhooks/revenuecat      RevenueCat reports a change (renewal, cancellation, expiry...)

const API = 'https://api.revenuecat.com/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Plan = 'solo' | 'plus' | 'studio';
type Interval = 'monthly' | 'annual';

// Bigger plan first when two subscriptions overlap during a switch.
const PLAN_RANK: Record<Plan, number> = { solo: 1, plus: 2, studio: 3 };

// One RevenueCat subscription (subscriber.subscriptions[productId] in the REST API v1).
export type StoreSubscription = {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  refunded_at?: string | null;
  store?: string;
  is_sandbox?: boolean;
};

export type StoreBilling = {
  status: 'none' | 'active' | 'past_due'; // see public.profiles.billing_status
  plan: Plan | null;
  interval: Interval | null;
  periodEnd: string | null; // the next renewal, or the end if cancelling
  cancelAtPeriodEnd: boolean;
};

const NONE: StoreBilling = { status: 'none', plan: null, interval: null, periodEnd: null, cancelAtPeriodEnd: false };

/** App Store product ids: toxoff_<plan>_<interval>, e.g. toxoff_solo_monthly, toxoff_studio_annual. */
export function planOfProduct(productId: string): { plan: Plan; interval: Interval } | null {
  // Google Play ids look like "toxoff_plus_monthly:base"; only the part before the colon counts.
  const match = productId.split(':')[0].match(/^toxoff_(solo|plus|studio)_(monthly|annual)$/);
  return match ? { plan: match[1] as Plan, interval: match[2] as Interval } : null;
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : 0);

/**
 * What the user's App Store subscriptions mean for the app. Counts while it's paid up or in
 * Apple's billing grace period (past_due: Apple is retrying the card). Refunded ones don't count.
 * Sandbox purchases require an explicit test-environment opt-in. Production purchases always win
 * over sandbox ones; within an environment, the bigger plan wins, then the one that runs longest.
 */
export function storeBillingState(
  subscriptions: Record<string, StoreSubscription>,
  now = Date.now(),
  allowSandbox = false
): StoreBilling {
  const live = Object.entries(subscriptions)
    .map(([productId, sub]) => ({ sub, planned: planOfProduct(productId) }))
    .filter(({ sub, planned }) => {
      const until = Math.max(time(sub.expires_date), time(sub.grace_period_expires_date));
      return planned && (allowSandbox || sub.is_sandbox !== true) && !sub.refunded_at && until > now;
    })
    .sort(
      (a, b) =>
        Number(a.sub.is_sandbox === true) - Number(b.sub.is_sandbox === true) ||
        PLAN_RANK[b.planned!.plan] - PLAN_RANK[a.planned!.plan] ||
        time(b.sub.expires_date) - time(a.sub.expires_date)
    );
  if (!live.length) return NONE;
  const { sub, planned } = live[0];
  return {
    status: sub.billing_issues_detected_at ? 'past_due' : 'active',
    plan: planned!.plan,
    interval: planned!.interval,
    periodEnd: sub.expires_date,
    cancelAtPeriodEnd: Boolean(sub.unsubscribe_detected_at),
  };
}

async function subscriber(uid: string): Promise<Record<string, StoreSubscription>> {
  const res = await fetch(`${API}/subscribers/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${env.revenuecatSecretKey()}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`RevenueCat returned ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.subscriber?.subscriptions ?? {};
}

/** Re-reads the user from RevenueCat and copies their subscription onto the profile. */
export async function syncStoreBilling(uid: string): Promise<StoreBilling> {
  const state = storeBillingState(await subscriber(uid), Date.now(), env.revenuecatAllowSandbox());
  const { error } = await db().rpc('apply_store_billing', {
    uid,
    p_status: state.status,
    p_plan: state.plan,
    p_interval: state.interval,
    p_period_end: state.periodEnd,
    p_cancel_at_period_end: state.cancelAtPeriodEnd,
  });
  if (error) throw error;
  return state;
}

export async function syncAppStore(req: Request): Promise<Response> {
  const uid = await requireUser(req);
  await throttle('store-sync', uid, 6); // each call reads RevenueCat with the project's key
  return json(await syncStoreBilling(uid));
}

/** The toxoff users an event is about. Anonymous RevenueCat ids ($RCAnonymousID:...) are skipped. */
export function eventUsers(event: Record<string, unknown>): string[] {
  const ids = [
    event.app_user_id,
    event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
    ...(Array.isArray(event.transferred_from) ? event.transferred_from : []),
    ...(Array.isArray(event.transferred_to) ? event.transferred_to : []),
  ];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && UUID.test(id)))];
}

export async function receiveRevenueCatWebhook(req: Request): Promise<Response> {
  // The Authorization header value set on the webhook in RevenueCat's dashboard.
  const given = req.headers.get('Authorization') ?? '';
  if (!safeEqual(given, env.revenuecatWebhookAuth())) return text('Unauthorized', 401);

  const body = await req.json().catch(() => null);
  const event = body?.event;
  if (!event || typeof event !== 'object') throw new HttpError(400, 'Invalid event.');

  // Every event is handled the same way: read the user's current state fresh, so events arriving
  // late or out of order can't leave an old state behind. Users toxoff doesn't know are skipped.
  const uids = eventUsers(event);
  if (uids.length) {
    const { data, error } = await db().from('profiles').select('id').in('id', uids);
    if (error) throw error;
    for (const { id } of data as { id: string }[]) await syncStoreBilling(id);
  }
  // An error (thrown above) makes RevenueCat send it again.
  return json({ received: true });
}
