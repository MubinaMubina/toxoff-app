import * as WebBrowser from 'expo-web-browser';
import { BillingInterval, PaidPlanId, PaymentMethod } from '../types';
import { apiPost, isApiConfigured } from './api';

/**
 * Safepay checkout (Pakistan).
 *
 * Safepay does not allow creating charges from the client. Your backend uses the
 * Safepay SECRET key to create a payment session / tracker token and returns a
 * hosted checkout URL (https://getsafepay.com/checkout/...). We open that URL,
 * preselecting JazzCash / Easypaisa / card, and listen for the success redirect
 * back to the app via the `toxoff://` scheme.
 *
 * Expected backend route:
 *   POST {EXPO_PUBLIC_API_BASE_URL}/billing/safepay/session  (Authorization: Bearer <session>)
 *   body: { planId, interval, method, returnUrl }
 *   returns: { checkoutUrl }
 */

export type SafepayParams = {
  planId: PaidPlanId;
  interval: BillingInterval;
  method: PaymentMethod;
};

export type SafepayResult =
  | { status: 'demo' }
  | { status: 'success' }
  | { status: 'cancelled' };

const RETURN_URL = 'toxoff://billing/safepay/return';

const safepayConfigured = isApiConfigured && Boolean(process.env.EXPO_PUBLIC_SAFEPAY_PUBLIC_KEY);

export async function createSafepayCheckout(
  params: SafepayParams
): Promise<SafepayResult> {
  if (!safepayConfigured) {
    // Demo mode — Safepay isn't set up yet. Pretend the subscription was created.
    return { status: 'demo' };
  }

  const { checkoutUrl } = await apiPost<{ checkoutUrl: string }>('/billing/safepay/session', {
    ...params,
    returnUrl: RETURN_URL,
  });

  const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, RETURN_URL);
  if (result.type === 'success') return { status: 'success' };
  return { status: 'cancelled' };
}
