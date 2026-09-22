import { PaidPlanId, Plan, PlanId } from '../types';

// Pricing lives in src/data/pricing.ts (location-based). Plans here describe the
// feature set / limits; the region decides the actual price + currency.
// Limits are mirrored server-side in public.plan_limits (supabase/migrations).
// Ads on the Free plan (the Home banner and rewarded ads). Off for version 1, while Google hasn't
// approved the AdMob account: nothing about ads is shown, asked or loaded. EXPO_PUBLIC_ADS=on in
// the build's environment brings all of it back.
export const ADS_ENABLED = process.env.EXPO_PUBLIC_ADS === 'on';

export const PAID_PLAN_COMMON_FEATURES = [
  'Unlimited comments moderated',
  ...(ADS_ENABLED ? ['No ads'] : []),
  '100+ languages',
  'All toxicity categories',
  'Custom keyword blocklist',
  'Your full moderation log',
];

// Comment checks a month on the Free plan; the count starts again on the monthly anniversary of
// joining. Must match plan_limits.monthly_checks (supabase/migrations).
export const FREE_CHECKS_PER_MONTH = 50;

// Rewarded ads: each one watched adds AD_REWARD_CHECKS to the pool of extra checks, up to
// AD_REWARDS_PER_DAY a day. Must match grant_ad_reward() (supabase/migrations).
export const AD_REWARD_CHECKS = 5;
export const AD_REWARDS_PER_DAY = 2;

// How far back the log reaches on Free. Must match plan_limits.log_history_days.
export const FREE_LOG_HISTORY_DAYS = 7;

// Invites: a friend who joins with your code and connects an Instagram account nobody has
// connected before earns you both INVITE_BONUS more checks, for up to MAX_INVITE_REWARDS
// friends. Must match grant_invite_reward() (supabase/migrations).
export const INVITE_BONUS = 5;
export const MAX_INVITE_REWARDS = 3;

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    maxAccounts: 1,
    keywordBlocklist: false,
    blockedUsers: false,
    ads: ADS_ENABLED,
    logHistoryDays: FREE_LOG_HISTORY_DAYS,
    tagline: 'toxoff on one account, free forever',
    features: [
      '1 Instagram account',
      `${FREE_CHECKS_PER_MONTH} comment checks a month`,
      ...(ADS_ENABLED ? [`Watch an ad for ${AD_REWARD_CHECKS} more, up to ${AD_REWARDS_PER_DAY} a day`] : []),
      `${INVITE_BONUS} more for each friend you invite (up to ${MAX_INVITE_REWARDS})`,
      `Last ${FREE_LOG_HISTORY_DAYS} days of your log`,
      '100+ languages',
      'All toxicity categories',
      ...(ADS_ENABLED ? ['Shows ads'] : []),
    ],
  },
  {
    id: 'solo',
    name: 'Solo',
    maxAccounts: 1,
    keywordBlocklist: true,
    blockedUsers: false,
    ads: false,
    logHistoryDays: null,
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
    ads: false,
    logHistoryDays: null,
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
    ads: false,
    logHistoryDays: null,
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

// Hiding is the default. In the optional auto mode, toxic comments at this confidence are deleted for good.
// Must match AUTO_DELETE_THRESHOLD in supabase/functions/api/moderation.ts.
export const AUTO_DELETE_PERCENT = 80;

// The same day of the month, n months on; clamped to the month's end like Postgres (31 Jan + 1
// month = 28 Feb, + 2 months = 31 Mar). Worked in UTC, as the server does.
function addMonths(date: Date, n: number): Date {
  const day = date.getUTCDate();
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1,
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first;
}

/**
 * The Free plan's current month: from the latest monthly anniversary of joining, to the next.
 * Mirrors public.free_period_start() (supabase/migrations).
 */
export function freePeriod(joined: Date, now = new Date()): { start: Date; end: Date } {
  let months = 0;
  while (addMonths(joined, months + 1) <= now) months++;
  return { start: addMonths(joined, months), end: addMonths(joined, months + 1) };
}
