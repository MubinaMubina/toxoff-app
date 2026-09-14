import { BillingInterval, PaidPlanId } from '../types';

/**
 * List prices in USD. The paywall shows the App Store's own prices, in the user's currency, when it
 * can (src/lib/purchases.ts); these stand in when it can't (Expo Go, demo mode). Set the real prices
 * per country in App Store Connect.
 *
 * Annual figures are the effective monthly price when billed yearly: annual = monthly * 10 / 12,
 * so a yearly plan is "2 months free".
 */

const twoMonthsFree = (monthly: number) => Math.round(((monthly * 10) / 12) * 100) / 100;

const LIST_PRICES: Record<PaidPlanId, Record<BillingInterval, number>> = {
  solo: { monthly: 5, annual: twoMonthsFree(5) }, // ~$4.17/mo billed yearly
  plus: { monthly: 9, annual: twoMonthsFree(9) }, // ~$7.50/mo billed yearly
};

export function formatUsd(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `$${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}`;
}

/** Per month. */
export const listPrice = (plan: PaidPlanId, interval: BillingInterval) => LIST_PRICES[plan][interval];

/** The yearly charge: 10 months (the rounded monthly figure × 12 would be a few cents off). */
export const listAnnualTotal = (plan: PaidPlanId) => LIST_PRICES[plan].monthly * 10;
