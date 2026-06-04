import * as WebBrowser from 'expo-web-browser';
import { BillingInterval, PaymentMethod, PlanId } from '../types';

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
 *   POST {EXPO_PUBLIC_API_BASE_URL}/billing/safepay/session
 *   body: { planId, interval, method, userId, currency: 'PKR' }
 *   returns: { checkoutUrl }
 */

export type SafepayParams = {
  planId: PlanId;
  interval: BillingInterval;
  method: PaymentMethod;
  userId: string;
};

export type SafepayResult =
  | { status: 'demo' }
  | { status: 'success' }
  | { status: 'cancelled' };

const RETURN_URL = 'toxoff://billing/safepay/return';

export async function createSafepayCheckout(
  params: SafepayParams
): Promise<SafepayResult> {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!base) {
    // Demo mode — no backend configured. Pretend the trial subscription was created.
    return { status: 'demo' };
  }

  const res = await fetch(`${base}/billing/safepay/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, currency: 'PKR', returnUrl: RETURN_URL }),
  });
  if (!res.ok) throw new Error('Could not start Safepay checkout');
  const { checkoutUrl } = (await res.json()) as { checkoutUrl: string };

  const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, RETURN_URL);
  if (result.type === 'success') return { status: 'success' };
  return { status: 'cancelled' };
}
