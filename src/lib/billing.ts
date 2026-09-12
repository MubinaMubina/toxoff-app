import {
  initPaymentSheet,
  PaymentSheetError,
  presentPaymentSheet,
} from '@stripe/stripe-react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { BillingInterval, PaidPlanId, PaymentMethod, Region } from '../types';
import { apiPost, isApiConfigured } from './api';
import { createSafepayCheckout } from './safepay';

/**
 * Region-routing billing layer.
 *
 * - Pakistan (region.provider === 'safepay') → Safepay hosted checkout
 *   (cards + JazzCash + Easypaisa). See src/lib/safepay.ts.
 * - Everywhere else (region.provider === 'stripe') → Stripe's payment sheet. The backend
 *   (supabase/functions/api/billing.ts) creates the subscription and hands back what the sheet
 *   needs; the Stripe secret key never leaves the server.
 *
 * Until a provider's backend and publishable key are configured, it runs in demo mode and every
 * call here resolves to { status: 'demo' }.
 */

export const stripeConfigured = isApiConfigured && Boolean(process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY);

export type SubscriptionParams = {
  planId: PaidPlanId;
  interval: BillingInterval;
  region: Region;
  method?: PaymentMethod; // chosen method (Safepay flows)
  email?: string; // fills in the payment sheet
  dark?: boolean;
};

export type SubscriptionResult =
  | { status: 'demo' }
  | { status: 'cancelled' }
  // startsLater: chosen during the free trial, so the first charge is when the trial ends.
  | { status: 'subscribed'; startsLater: boolean }
  | { status: 'changed' }; // an existing subscription moved to this plan, or was kept on

type SubscribeResponse =
  | { status: 'payment' | 'setup'; clientSecret: string }
  | { status: 'updated' };

async function startStripe(params: SubscriptionParams): Promise<SubscriptionResult> {
  if (!stripeConfigured) return { status: 'demo' };

  // The backend maps plan + interval to its Stripe price; the app never picks prices.
  const res = await apiPost<SubscribeResponse>('/billing/subscribe', {
    planId: params.planId,
    interval: params.interval,
  });
  if (res.status === 'updated') return { status: 'changed' };

  const common = {
    merchantDisplayName: 'toxoff',
    style: params.dark ? ('alwaysDark' as const) : ('alwaysLight' as const),
    defaultBillingDetails: params.email ? { email: params.email } : undefined,
  };
  const { error: initError } = await initPaymentSheet(
    res.status === 'payment'
      ? { ...common, paymentIntentClientSecret: res.clientSecret }
      : // During the trial the sheet only saves the card, so its button shouldn't say "Pay".
        { ...common, setupIntentClientSecret: res.clientSecret, primaryButtonLabel: 'Subscribe' }
  );
  if (initError) throw new Error(initError.message);

  const { error } = await presentPaymentSheet();
  if (error?.code === PaymentSheetError.Canceled) return { status: 'cancelled' };
  if (error) throw new Error(error.message);

  // Stripe's webhook reports it too; this makes the new plan show straight away.
  await apiPost('/billing/sync');
  return { status: 'subscribed', startsLater: res.status === 'setup' };
}

export async function startSubscription(
  params: SubscriptionParams
): Promise<SubscriptionResult> {
  if (params.region.provider === 'safepay') {
    const result = await createSafepayCheckout({
      planId: params.planId,
      interval: params.interval,
      method: params.method ?? 'card',
    });
    return result.status === 'success' ? { status: 'subscribed', startsLater: false } : result;
  }
  return startStripe(params);
}

/** Ends the subscription after the period already paid for (right away if chosen during the trial). */
export async function cancelSubscription(): Promise<{ status: 'demo' | 'cancelled' }> {
  if (!stripeConfigured) return { status: 'demo' };
  await apiPost('/billing/cancel');
  return { status: 'cancelled' };
}

/** Takes back a cancellation, so the subscription keeps renewing. */
export async function resumeSubscription(
  planId: PaidPlanId,
  interval: BillingInterval
): Promise<{ status: 'demo' | 'resumed' }> {
  if (!stripeConfigured) return { status: 'demo' };
  // Choosing the plan you're on takes the cancellation back (backend: change() in billing.ts).
  await apiPost('/billing/subscribe', { planId, interval });
  return { status: 'resumed' };
}

/** Stripe's page for changing the card on file and downloading invoices. */
export async function openBillingPortal(): Promise<{ status: 'demo' | 'closed' }> {
  if (!stripeConfigured) return { status: 'demo' };
  const returnUrl = AuthSession.makeRedirectUri({ scheme: 'toxoff', path: 'settings' });
  const { url } = await apiPost<{ url: string }>('/billing/portal', { returnUrl });
  await WebBrowser.openAuthSessionAsync(url, returnUrl);
  // A new card may have settled a failed payment.
  await apiPost('/billing/sync');
  return { status: 'closed' };
}
