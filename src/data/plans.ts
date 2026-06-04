import { Plan } from '../types';

// Pricing lives in src/data/pricing.ts (location-based). Plans here describe the
// feature set / account limits; the region decides the actual price + currency.
export const PLANS: Plan[] = [
  {
    id: 'solo',
    name: 'Solo',
    maxAccounts: 1,
    tagline: 'For one creator, one platform',
    features: [
      '1 connected account (Instagram or TikTok)',
      'Unlimited comments moderated',
      '100+ languages',
      'All toxicity categories',
      'Custom keyword blocklist',
    ],
  },
  {
    id: 'plus',
    name: 'Plus',
    maxAccounts: 5,
    popular: true,
    tagline: 'For creators running multiple accounts',
    features: [
      'Up to 5 accounts across Instagram + TikTok',
      'Unlimited comments moderated',
      '100+ languages',
      'All toxicity categories + custom rules',
      'Custom keyword blocklist & blocked users',
      'Priority support',
    ],
  },
];

export function getPlan(id: Plan['id']): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export const TRIAL_DAYS = 7;
