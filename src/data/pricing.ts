import { getLocales } from 'expo-localization';
import { BillingInterval, PlanId, Region } from '../types';

/**
 * Location-based pricing. Pakistan is the launch market and routes to Safepay
 * (cards + JazzCash + Easypaisa); everywhere else falls back to USD via Stripe.
 *
 * Annual figures are the *effective monthly* price when billed yearly. We set
 * annual = monthly * 10 / 12 so a yearly plan = "2 months free".
 */

const twoMonthsFree = (monthly: number) =>
  Math.round(((monthly * 10) / 12) * 100) / 100;

export const PAKISTAN: Region = {
  code: 'PK',
  country: 'Pakistan',
  currency: 'PKR',
  symbol: 'Rs',
  provider: 'safepay',
  methods: ['jazzcash', 'easypaisa', 'card'],
  prices: {
    solo: { monthly: 1100, annual: twoMonthsFree(1100) }, // ~Rs 917/mo billed yearly
    plus: { monthly: 2500, annual: twoMonthsFree(2500) }, // ~Rs 2,083/mo billed yearly
  },
};

export const DEFAULT_REGION: Region = {
  code: 'US',
  country: 'United States',
  currency: 'USD',
  symbol: '$',
  provider: 'stripe',
  methods: ['card', 'apple_pay', 'google_pay'],
  prices: {
    solo: { monthly: 4, annual: twoMonthsFree(4) }, // ~$3.33/mo billed yearly
    plus: { monthly: 9, annual: twoMonthsFree(9) }, // ~$7.50/mo billed yearly
  },
};

// Add more launch markets here over time.
export const REGIONS: Record<string, Region> = {
  PK: PAKISTAN,
  US: DEFAULT_REGION,
};

/** Best-guess region from the device locale; safe to call at module load. */
export function detectRegion(): Region {
  try {
    const code = getLocales()?.[0]?.regionCode?.toUpperCase();
    if (code && REGIONS[code]) return REGIONS[code];
  } catch {
    // expo-localization not available (e.g. some web contexts) — fall through.
  }
  return DEFAULT_REGION;
}

export function regionByCode(code: string): Region {
  return REGIONS[code.toUpperCase()] ?? DEFAULT_REGION;
}

/** Currency-aware price formatting. PKR shows no decimals; USD shows up to 2. */
export function formatPrice(region: Region, amount: number): string {
  if (region.currency === 'PKR') {
    return `${region.symbol} ${Math.round(amount).toLocaleString()}`;
  }
  const rounded = Math.round(amount * 100) / 100;
  const text = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2);
  return `${region.symbol}${text}`;
}

export function priceFor(
  region: Region,
  plan: PlanId,
  interval: BillingInterval
): number {
  return region.prices[plan][interval];
}

/** Yearly total (used for the "billed Rs X/year" line on annual). */
export function annualTotal(region: Region, plan: PlanId): number {
  return region.prices[plan].annual * 12;
}

export const METHOD_LABEL: Record<string, string> = {
  card: 'Card',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  bank: 'Bank transfer',
};
