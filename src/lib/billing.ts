import { BillingInterval, PaidPlanId, PaymentMethod, Region } from '../types';
import { apiPost, isApiConfigured } from './api';
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

export type SubscriptionParams = {
  planId: PaidPlanId;
  interval: BillingInterval;
  region: Region;
  method?: PaymentMethod; // chosen method (Safepay flows)
};

export type SubscriptionResult =
  | { status: 'demo' }
  | { status: 'success' }
  | { status: 'cancelled' };

async function startStripe(params: SubscriptionParams): Promise<SubscriptionResult> {
  if (!isApiConfigured) return { status: 'demo' };

  // The backend maps plan + interval to its Stripe price; the app never picks prices.
  await apiPost('/billing/subscribe', { planId: params.planId, interval: params.interval });
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
    });
  }
  return startStripe(params);
}
