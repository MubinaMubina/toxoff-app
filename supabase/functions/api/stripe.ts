// Stripe's REST API, called with fetch (no SDK): form-encoded requests, one pinned API version.
// https://docs.stripe.com/api
import { verifyHmacSha256 } from './crypto.ts';
import { env } from './env.ts';

const API = 'https://api.stripe.com/v1';
// The response shapes below follow this version; change it only together with the code reading them.
export const API_VERSION = '2025-03-31.basil';

export class StripeError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
  }
}

export type Price = { id: string; lookup_key: string | null };

export type SetupIntent = { id: string; status: string; client_secret: string };

export type Customer = { id: string; invoice_settings: { default_payment_method: string | null } };

export type Subscription = {
  id: string;
  customer: string;
  status:
    | 'incomplete'
    | 'incomplete_expired'
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | 'paused';
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  trial_end: number | null;
  current_period_end?: number; // older API versions; since 2025-03-31 it's on each item
  default_payment_method: string | null;
  // Saves the card during a trial; an object only when expanded, null once it has succeeded.
  pending_setup_intent: string | SetupIntent | null;
  latest_invoice?: string | { id: string; confirmation_secret?: { client_secret: string } | null } | null;
  items: { data: { id: string; price: Price; current_period_end?: number }[] };
};

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: { id: string; object: string; customer?: string | null } };
};

type Params = Record<string, unknown>;

/** Stripe's form encoding: nested objects as a[b]=1, arrays as a[0]=1; null and undefined are left out. */
export function formEncode(params: Params): URLSearchParams {
  const out = new URLSearchParams();
  const add = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => add(`${key}[${i}]`, v));
    else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Params)) add(`${key}[${k}]`, v);
    } else out.append(key, String(value));
  };
  for (const [key, value] of Object.entries(params)) add(key, value);
  return out;
}

async function request<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params: Params = {},
  idempotencyKey?: string
): Promise<T> {
  const form = formEncode(params).toString();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.stripeSecretKey()}`,
    'Stripe-Version': API_VERSION,
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  let url = `${API}${path}`;
  let body: string | undefined;
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = form;
  } else if (form) {
    url += `?${form}`;
  }
  const res = await fetch(url, { method, headers, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new StripeError(res.status, json?.error?.message ?? `Stripe returned ${res.status}`, json?.error?.code);
  }
  return json as T;
}

// The same key within 24 hours returns the first customer, so a double tap can't make two.
export const createCustomer = (userId: string, email: string | undefined) =>
  request<{ id: string }>('POST', '/customers', { email, metadata: { user_id: userId } }, `toxoff-customer-${userId}`);

export async function pricesByLookupKey(keys: string[]): Promise<Price[]> {
  const res = await request<{ data: Price[] }>('GET', '/prices', { lookup_keys: keys, active: true, limit: 10 });
  return res.data;
}

/**
 * Starts a subscription that waits for the app's payment sheet (payment_behavior default_incomplete).
 * With `trialEnd`, nothing is charged until then: the sheet only saves the card, through the
 * pending setup intent. Without it, the first invoice is paid in the sheet.
 */
export function createSubscription(opts: {
  customer: string;
  price: string;
  userId: string;
  trialEnd?: number;
}): Promise<Subscription> {
  return request('POST', '/subscriptions', {
    customer: opts.customer,
    items: [{ price: opts.price }],
    payment_behavior: 'default_incomplete',
    // Cards only. (Apple Pay and Google Pay pay with cards as well, once they're turned on in the
    // app's payment sheet: README > Stripe.) The card paid with is kept on the subscription;
    // billing.ts then moves it to the customer.
    payment_settings: { payment_method_types: ['card'], save_default_payment_method: 'on_subscription' },
    trial_end: opts.trialEnd,
    // If the trial ends without a card, end the subscription instead of billing nobody.
    trial_settings: opts.trialEnd ? { end_behavior: { missing_payment_method: 'cancel' } } : undefined,
    metadata: { user_id: opts.userId },
    expand: ['latest_invoice.confirmation_secret', 'pending_setup_intent'],
  });
}

export const getSubscription = (id: string) =>
  request<Subscription>('GET', `/subscriptions/${encodeURIComponent(id)}`);

export const updateSubscription = (id: string, params: Params) =>
  request<Subscription>('POST', `/subscriptions/${encodeURIComponent(id)}`, params);

/** Ends it now. (To end it after the paid period, set cancel_at_period_end instead.) */
export const cancelSubscription = (id: string) =>
  request<Subscription>('DELETE', `/subscriptions/${encodeURIComponent(id)}`);

export const cancelSetupIntent = (id: string) =>
  request<SetupIntent>('POST', `/setup_intents/${encodeURIComponent(id)}/cancel`);

export const getCustomer = (id: string) => request<Customer>('GET', `/customers/${encodeURIComponent(id)}`);

/** The card renewals and the first charge after a trial go to, and the one Stripe's billing portal changes. */
export const setDefaultCard = (customer: string, paymentMethod: string) =>
  request<Customer>('POST', `/customers/${encodeURIComponent(customer)}`, {
    invoice_settings: { default_payment_method: paymentMethod },
  });

/** The customer's most recently added card, if any. */
export async function newestCard(customer: string): Promise<string | null> {
  const res = await request<{ data: { id: string }[] }>(
    'GET',
    `/customers/${encodeURIComponent(customer)}/payment_methods`,
    { type: 'card', limit: 1 }
  );
  return res.data[0]?.id ?? null;
}

export const createPortalSession = (customer: string, returnUrl: string) =>
  request<{ url: string }>('POST', '/billing_portal/sessions', { customer, return_url: returnUrl });

/**
 * Checks a webhook's Stripe-Signature header (t=<unix time>,v1=<hex HMAC-SHA256 of "t.body">) and
 * returns the event, or null if no signature matches or it's older than `toleranceSec` (a replay).
 */
export async function verifyWebhook(
  body: ArrayBuffer,
  header: string | null,
  secret: string,
  toleranceSec = 300,
  now = Date.now()
): Promise<StripeEvent | null> {
  const fields = (header ?? '').split(',').map((part) => part.trim().split('='));
  const timestamp = fields.find(([k]) => k === 't')?.[1] ?? '';
  const signatures = fields.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!/^\d+$/.test(timestamp) || !signatures.length) return null;
  if (Math.abs(now / 1000 - Number(timestamp)) > toleranceSec) return null;

  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const signed = new Uint8Array(prefix.length + body.byteLength);
  signed.set(prefix);
  signed.set(new Uint8Array(body), prefix.length);
  let valid = false;
  for (const signature of signatures) valid ||= await verifyHmacSha256(secret, signed.buffer, signature);
  if (!valid) return null;
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
}
