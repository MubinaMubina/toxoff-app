import { db, requireUser } from './db.ts';
import { env, returnSchemes } from './env.ts';
import { HttpError, json, readJson, redirect, text } from './http.ts';
import * as stripe from './stripe.ts';

// Subscriptions through Stripe (app: src/lib/billing.ts). Stripe is the source of truth; the user's
// current subscription is copied onto their profile (public.apply_billing) whenever it may have
// changed: after each route below, and on every webhook.
//   POST /billing/subscribe  { planId, interval }  start a subscription, or change or resume the current one
//   POST /billing/sync       re-read it from Stripe (the app calls this when the payment sheet closes)
//   POST /billing/cancel     stop it (at the end of the period already paid for)
//   POST /billing/portal     { returnUrl }  Stripe's page for the card on file and past invoices
//   GET  /billing/return     sends the browser from that page back to the app
//   POST /webhooks/stripe    Stripe reports a change

const PLANS = ['solo', 'plus'] as const;
const INTERVALS = ['monthly', 'annual'] as const;
type Plan = (typeof PLANS)[number];
type Interval = (typeof INTERVALS)[number];


// Each price carries a lookup key, set in the Stripe dashboard: toxoff_solo_monthly,
// toxoff_solo_annual, toxoff_plus_monthly and toxoff_plus_annual. The app never names prices.
export const lookupKey = (plan: Plan, interval: Interval) => `toxoff_${plan}_${interval}`;

export function planOfPrice(price: stripe.Price): { plan: Plan; interval: Interval } | null {
  const match = price.lookup_key?.match(/^toxoff_(solo|plus)_(monthly|annual)$/);
  return match ? { plan: match[1] as Plan, interval: match[2] as Interval } : null;
}

export type BillingState = {
  status: 'none' | 'scheduled' | 'active' | 'past_due'; // see public.profiles.billing_status
  plan: Plan;
  interval: Interval;
  periodEnd: string | null; // the next charge, or the end if cancelling
  cancelAtPeriodEnd: boolean;
};

/** What a Stripe subscription means for the app. `cardSaved`: a trialing one has a card to charge. */
export function billingState(sub: stripe.Subscription, cardSaved: boolean): BillingState {
  const item = sub.items.data[0];
  const planned = planOfPrice(item.price);
  if (!planned) {
    throw new Error(`Subscription ${sub.id} uses price ${item.price.id}, which has no toxoff lookup key`);
  }
  // incomplete (payment sheet never finished), canceled, unpaid (retries ran out) and the rest: none.
  const status =
    sub.status === 'active' ? 'active'
    : sub.status === 'past_due' ? 'past_due'
    : sub.status === 'trialing' && cardSaved ? 'scheduled'
    : 'none';
  const end =
    sub.cancel_at ??
    (sub.status === 'trialing' ? sub.trial_end : item.current_period_end ?? sub.current_period_end ?? null);
  return {
    status,
    ...planned,
    periodEnd: end ? new Date(end * 1000).toISOString() : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at != null,
  };
}

/**
 * Keeps one card per user, on the Stripe customer: renewals and the first charge after a trial go to
 * it, and it's the one Stripe's billing portal changes. Stripe keeps the first card paid with on the
 * subscription itself, where it would win over a card changed in the portal, so it's moved; a card
 * saved during the trial may only be attached to the customer, so it's made the default.
 * Returns whether there's a card to charge (what makes a trialing subscription count).
 */
async function cardOnFile(sub: stripe.Subscription): Promise<boolean> {
  if (sub.status !== 'trialing' && sub.status !== 'active' && sub.status !== 'past_due') return false;
  if (sub.default_payment_method) {
    await stripe.setDefaultCard(sub.customer, sub.default_payment_method);
    await stripe.updateSubscription(sub.id, {
      default_payment_method: '', // '' clears it
      payment_settings: { save_default_payment_method: 'off' }, // and stop Stripe putting it back
    });
    return true;
  }
  // The payment sheet hasn't saved a card for this trial yet (a card from before doesn't count).
  if (sub.status === 'trialing' && sub.pending_setup_intent) return false;
  const customer = await stripe.getCustomer(sub.customer);
  if (customer.invoice_settings.default_payment_method) return true;
  const card = await stripe.newestCard(sub.customer);
  if (!card) return false;
  await stripe.setDefaultCard(sub.customer, card);
  return true;
}

/** Copies the subscription onto the profile; ignored unless it's the user's current one. */
async function apply(uid: string, sub: stripe.Subscription): Promise<BillingState> {
  const state = billingState(sub, await cardOnFile(sub));
  const { error } = await db().rpc('apply_billing', {
    uid,
    p_subscription_id: sub.id,
    p_status: state.status,
    p_plan: state.plan,
    p_interval: state.interval,
    p_period_end: state.periodEnd,
    p_cancel_at_period_end: state.cancelAtPeriodEnd,
  });
  if (error) throw error;
  return state;
}

type CustomerRow = { customer_id: string; subscription_id: string | null };

async function customerRow(uid: string): Promise<CustomerRow | null> {
  const { data, error } = await db()
    .from('stripe_customers')
    .select('customer_id, subscription_id')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureCustomer(uid: string): Promise<CustomerRow> {
  const existing = await customerRow(uid);
  if (existing) return existing;
  const { data, error } = await db().auth.admin.getUserById(uid);
  if (error) throw error;
  const customer = await stripe.createCustomer(uid, data.user.email || undefined);
  const { error: insertError } = await db()
    .from('stripe_customers')
    .upsert({ user_id: uid, customer_id: customer.id }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (insertError) throw insertError;
  return (await customerRow(uid))!;
}

async function findPrice(plan: Plan, interval: Interval): Promise<stripe.Price> {
  const key = lookupKey(plan, interval);
  const price = (await stripe.pricesByLookupKey([key])).find((p) => p.lookup_key === key);
  if (!price) throw new HttpError(503, `The ${plan} ${interval} price isn't set up in Stripe yet (lookup key ${key}).`);
  return price;
}

export async function subscribe(req: Request): Promise<Response> {
  const uid = await requireUser(req);
  const body = await readJson(req);
  const plan = PLANS.find((p) => p === body.planId);
  const interval = INTERVALS.find((i) => i === body.interval);
  if (!plan || !interval) throw new HttpError(400, 'Choose a plan and how often to pay.');

  const price = await findPrice(plan, interval);
  const customer = await ensureCustomer(uid);
  const current = customer.subscription_id ? await stripe.getSubscription(customer.subscription_id) : null;
  if (current) {
    const state = billingState(current, await cardOnFile(current));
    if (state.status !== 'none') return json(await change(uid, current, state, price));
    // Left unfinished (a payment sheet closed before paying) or unpaid after every retry: replace it.
    if (current.status !== 'canceled' && current.status !== 'incomplete_expired') {
      await stripe.cancelSubscription(current.id);
      // Stripe leaves an unfinished trial's card step open when the subscription goes. Tidying only.
      if (typeof current.pending_setup_intent === 'string') {
        await stripe.cancelSetupIntent(current.pending_setup_intent).catch((e) => console.warn('SetupIntent cancel failed', e));
      }
    }
  }

  const sub = await stripe.createSubscription({
    customer: customer.customer_id,
    price: price.id,
    userId: uid,
  });
  const { error } = await db().from('stripe_customers').update({ subscription_id: sub.id }).eq('user_id', uid);
  if (error) throw error;

  // The app opens Stripe's payment sheet with this: to save the card (trial) or pay the first invoice.
  const setup = typeof sub.pending_setup_intent === 'object' ? sub.pending_setup_intent?.client_secret : undefined;
  if (setup) return json({ status: 'setup', clientSecret: setup });
  const invoice = typeof sub.latest_invoice === 'object' ? sub.latest_invoice : null;
  const payment = invoice?.confirmation_secret?.client_secret;
  if (payment) return json({ status: 'payment', clientSecret: payment });
  // Nothing to pay now (a 100% discount, say): it's already running.
  await apply(uid, sub);
  return json({ status: 'updated' });
}

/** Moves a running subscription to another price, and/or takes back a cancellation. */
async function change(
  uid: string,
  current: stripe.Subscription,
  state: BillingState,
  price: stripe.Price
): Promise<{ status: 'updated' }> {
  if (state.status === 'past_due') {
    throw new HttpError(409, "Your last payment didn't go through. Update your card in Manage billing first.");
  }
  const item = current.items.data[0];
  const params: Record<string, unknown> = {};
  if (current.cancel_at_period_end) params.cancel_at_period_end = false;
  else if (current.cancel_at != null) params.cancel_at = ''; // '' clears it
  if (item.price.id !== price.id) {
    params.items = [{ id: item.id, price: price.id }];
    if (current.status === 'trialing') {
      params.proration_behavior = 'none'; // nothing has been charged yet
    } else {
      // Charge (or credit) the difference now. If the bank declines or wants the person to confirm,
      // Stripe leaves the subscription as it was and answers 402.
      params.proration_behavior = 'always_invoice';
      params.payment_behavior = 'error_if_incomplete';
    }
  }
  if (!Object.keys(params).length) {
    await apply(uid, current);
    return { status: 'updated' };
  }
  let updated: stripe.Subscription;
  try {
    updated = await stripe.updateSubscription(current.id, params);
  } catch (e) {
    if (e instanceof stripe.StripeError && e.status === 402) {
      throw new HttpError(402, "Your bank didn't approve the change, so your plan is the same. Check your card in Manage billing, then try again.");
    }
    throw e;
  }
  await apply(uid, updated);
  return { status: 'updated' };
}

async function currentSubscription(uid: string) {
  const customer = await customerRow(uid);
  return customer?.subscription_id ? await stripe.getSubscription(customer.subscription_id) : null;
}

export async function sync(req: Request): Promise<Response> {
  const uid = await requireUser(req);
  const current = await currentSubscription(uid);
  return json({ billing: current ? await apply(uid, current) : null });
}

export async function cancel(req: Request): Promise<Response> {
  const uid = await requireUser(req);
  const current = await currentSubscription(uid);
  const state = current ? billingState(current, await cardOnFile(current)) : null;
  if (!current || !state || state.status === 'none') {
    throw new HttpError(404, "You don't have a subscription to cancel.");
  }
  // Chosen during the trial, nothing has been charged yet, so it simply goes and the trial carries
  // on. Otherwise it runs to the end of the period already paid for.
  const updated =
    state.status === 'scheduled'
      ? await stripe.cancelSubscription(current.id)
      : await stripe.updateSubscription(current.id, { cancel_at_period_end: true });
  return json({ billing: await apply(uid, updated) });
}

export async function portal(req: Request): Promise<Response> {
  const uid = await requireUser(req);
  const { returnUrl = 'toxoff://settings' } = await readJson(req);
  if (typeof returnUrl !== 'string' || !returnSchemes().some((s) => returnUrl.startsWith(s))) {
    throw new HttpError(400, 'Invalid return URL.');
  }
  const customer = await customerRow(uid);
  if (!customer) throw new HttpError(404, "You don't have any billing details yet.");
  const back = `${env.supabaseUrl()}/functions/v1/api/billing/return?to=${encodeURIComponent(returnUrl)}`;
  const session = await stripe.createPortalSession(customer.customer_id, back);
  return json({ url: session.url });
}

// The portal's "Return to toxoff" link is a web address (this one); it hands over to the app.
export function billingReturn(url: URL): Response {
  const to = url.searchParams.get('to') ?? '';
  if (!returnSchemes().some((s) => to.startsWith(s))) return text('You can go back to toxoff now.', 400);
  return redirect(to);
}

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

export async function receiveStripeWebhook(req: Request): Promise<Response> {
  const event = await stripe.verifyWebhook(
    await req.arrayBuffer(),
    req.headers.get('Stripe-Signature'),
    env.stripeWebhookSecret()
  );
  if (!event) return text('Invalid signature', 400);

  const object = event.data.object;
  const isSubscription = SUBSCRIPTION_EVENTS.has(event.type);
  // setup_intent.succeeded: a card was saved for a subscription chosen during the trial.
  if ((isSubscription || event.type === 'setup_intent.succeeded') && typeof object.customer === 'string') {
    const { data: row, error } = await db()
      .from('stripe_customers')
      .select('user_id, subscription_id')
      .eq('customer_id', object.customer)
      .maybeSingle();
    if (error) throw error;
    const subscriptionId = isSubscription ? object.id : row?.subscription_id;
    // Only the user's current subscription counts, and it's read fresh from Stripe, so events
    // arriving late or out of order can't leave an old state behind.
    if (row && subscriptionId && subscriptionId === row.subscription_id) {
      await apply(row.user_id, await stripe.getSubscription(subscriptionId));
    }
  }
  // Anything unhandled is acknowledged too; an error (thrown above) makes Stripe send it again.
  return json({ received: true });
}
