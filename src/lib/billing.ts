import { BillingInterval, PaymentMethod, PlanId, Region } from '../types';
import { createSafepayCheckout } from './safepay';

/**
 * Region-routing billing layer.
 *
 * - Pakistan (region.provider === 'safepay') → Safepay hosted checkout
 *   (cards + JazzCash + Easypaisa). See src/lib/safepay.ts.
 * - Everywhere else (region.provider === 'stripe') → Stripe PaymentSheet, created
 *   server-side with the 7-day trial. Never put the Stripe secret key in the app.
 *
 * Both providers need a backend; with no EXPO_PUBLIC_API_BASE_URL configured the
 * app runs in demo mode and `startSubscription` resolves to { status: 'demo' }.
 */

// Stripe price IDs per plan + interval (configure in your Stripe dashboard).
const STRIPE_PRICE_IDS: Record<PlanId, Record<BillingInterval, string>> = {
  solo: { monthly: 'price_solo_monthly', annual: 'price_solo_annual' },
  plus: { monthly: 'price_plus_monthly', annual: 'price_plus_annual' },
};

export type SubscriptionParams = {
  planId: PlanId;
  interval: BillingInterval;
  region: Region;
  userId: string;
  method?: PaymentMethod; // chosen method (Safepay flows)
};

export type SubscriptionResult =
  | { status: 'demo' }
  | { status: 'success' }
  | { status: 'cancelled' };

async function startStripe(params: SubscriptionParams): Promise<SubscriptionResult> {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!base) return { status: 'demo' };

  const res = await fetch(`${base}/billing/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      planId: params.planId,
      interval: params.interval,
      userId: params.userId,
      currency: params.region.currency,
      priceId: STRIPE_PRICE_IDS[params.planId][params.interval],
    }),
  });
  if (!res.ok) throw new Error('Could not start subscription');
  // The screen then presents the PaymentSheet with these params via
  // @stripe/stripe-react-native (initPaymentSheet / presentPaymentSheet).
  // Returning success here keeps the demo flow simple; wire the sheet in the UI.
  return { status: 'success' };
}

export async function startSubscription(
  params: SubscriptionParams
): Promise<SubscriptionResult> {
  if (params.region.provider === 'safepay') {
    return createSafepayCheckout({
      planId: params.planId,
      interval: params.interval,
      method: params.method ?? 'card',
      userId: params.userId,
    });
  }
  return startStripe(params);
}
