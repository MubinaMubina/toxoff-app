import { BillingInterval, PaidPlanId } from '../types';

/**
 * List prices in USD. The paywall shows the App Store's own prices, in the user's currency, when it
 * can (src/lib/purchases.ts); these stand in when it can't (Expo Go, demo mode). Set the real prices
 * per country in App Store Connect (custom storefront prices for Pakistan and India, where the
 * global price is a lot in local money).
 *
 * Yearly plans are priced well under twelve months: the discount is what sells annual on the paywall,
 * and annual users can't churn for a year.
 */

const LIST_PRICES: Record<PaidPlanId, { monthly: number; yearly: number }> = {
  solo: { monthly: 6.99, yearly: 49.99 }, // ~$4.17/mo billed yearly, save 40%
  plus: { monthly: 12.99, yearly: 99.99 }, // ~$8.33/mo billed yearly, save 36%
  studio: { monthly: 29.99, yearly: 249.99 }, // ~$20.83/mo billed yearly, save 31%
};

export function formatUsd(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `$${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}`;
}

/** Per month: the monthly price, or the yearly charge spread over twelve months. */
export const listPrice = (plan: PaidPlanId, interval: BillingInterval) =>
  interval === 'monthly'
    ? LIST_PRICES[plan].monthly
    : Math.round((LIST_PRICES[plan].yearly / 12) * 100) / 100;

/** The yearly charge. */
export const listAnnualTotal = (plan: PaidPlanId) => LIST_PRICES[plan].yearly;

/** How much cheaper a year is than twelve months, as a whole percentage. */
export function annualSavings(monthly: number, yearly: number): number {
  if (!(monthly > 0) || !(yearly >= 0)) return 0;
  return Math.max(0, Math.round((1 - yearly / (monthly * 12)) * 100));
}

export const listAnnualSavings = (plan: PaidPlanId) =>
  annualSavings(LIST_PRICES[plan].monthly, LIST_PRICES[plan].yearly);

/** The biggest annual discount across the plans, for the "Annual · save up to N%" toggle. */
export const MAX_ANNUAL_SAVINGS = Math.max(
  ...(Object.keys(LIST_PRICES) as PaidPlanId[]).map(listAnnualSavings)
);
