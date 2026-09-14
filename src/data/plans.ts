import { PaidPlanId, Plan, PlanId } from '../types';

// Pricing lives in src/data/pricing.ts (location-based). Plans here describe the
// feature set / limits; the region decides the actual price + currency.
// Limits are mirrored server-side in public.plan_limits (supabase/migrations).
export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    maxAccounts: 1,
    keywordBlocklist: false,
    blockedUsers: false,
    tagline: 'Try toxoff on one account',
    features: [
      '1 connected account (Instagram or TikTok)',
      '20 free comment checks (shared with your trial)',
      '5 more for each friend you invite (up to 3)',
      '100+ languages',
      'All toxicity categories',
    ],
  },
  {
    id: 'solo',
    name: 'Solo',
    maxAccounts: 1,
    keywordBlocklist: true,
    blockedUsers: false,
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
    keywordBlocklist: true,
    blockedUsers: true,
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

export const PAID_PLANS = PLANS.filter(
  (p): p is Plan & { id: PaidPlanId } => p.id !== 'free'
);

export function getPlan(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

// Must match the trial length in handle_new_user() (supabase/migrations).
export const TRIAL_DAYS = 7;

// Comments an account can have checked without paying, across its trial and the Free
// plan combined. Never resets. Must match consume_comment_check() (supabase/migrations).
export const FREE_COMMENT_ALLOWANCE = 20;

// Invites: a friend who joins with your code and connects an Instagram account nobody has
// connected before earns you both INVITE_BONUS more free checks, for up to MAX_INVITE_REWARDS
// friends. Must match grant_invite_reward() (supabase/migrations).
export const INVITE_BONUS = 5;
export const MAX_INVITE_REWARDS = 3;
