import { PaidPlanId, Plan, PlanId } from '../types';

// Pricing lives in src/data/pricing.ts (location-based). Plans here describe the
// feature set / limits; the region decides the actual price + currency.
// Limits are mirrored server-side in public.plan_limits (supabase/migrations).
export const PAID_PLAN_COMMON_FEATURES = [
  'Unlimited comments moderated',
  '100+ languages',
  'All toxicity categories',
  'Custom keyword blocklist',
];

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    maxAccounts: 1,
    keywordBlocklist: false,
    blockedUsers: false,
    tagline: 'Try toxoff on one account',
    features: [
      '1 Instagram account',
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
    tagline: 'For one creator',
    features: [
      '1 Instagram account',
      ...PAID_PLAN_COMMON_FEATURES,
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
      'Up to 5 Instagram accounts',
      ...PAID_PLAN_COMMON_FEATURES,
      'Blocked users list',
      'Priority support',
    ],
  },
  {
    id: 'studio',
    name: 'Studio',
    maxAccounts: 15,
    keywordBlocklist: true,
    blockedUsers: true,
    tagline: 'For managers and small agencies',
    features: [
      'Up to 15 Instagram accounts',
      ...PAID_PLAN_COMMON_FEATURES,
      'Blocked users list',
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

// Hiding is the default. In the optional auto mode, toxic comments at this confidence are deleted for good.
// Must match AUTO_DELETE_THRESHOLD in supabase/functions/api/moderation.ts.
export const AUTO_DELETE_PERCENT = 80;

// Comments an account can have checked without paying, across its trial and the Free
// plan combined. Never resets. Must match consume_comment_check() (supabase/migrations).
export const FREE_COMMENT_ALLOWANCE = 20;

// Invites: a friend who joins with your code and connects an Instagram account nobody has
// connected before earns you both INVITE_BONUS more free checks, for up to MAX_INVITE_REWARDS
// friends. Must match grant_invite_reward() (supabase/migrations).
export const INVITE_BONUS = 5;
export const MAX_INVITE_REWARDS = 3;
