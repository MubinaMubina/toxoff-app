export type Platform = 'instagram' | 'tiktok';

export type ModerationReason =
  | 'hate_speech'
  | 'harassment'
  | 'slurs'
  | 'spam'
  | 'self_harm'
  | 'toxicity';

export type Sensitivity = 'low' | 'medium' | 'high';

export type RemovedComment = {
  id: string;
  platform: Platform;
  username: string;
  text: string;
  reason: ModerationReason;
  confidence: number; // 0..1 from the AI classifier
  language: string | null; // null when the classifier doesn't report it
  postRef: string;
  createdAt: string; // ISO timestamp
  restored?: boolean;
};

export type ConnectedAccount = {
  id: string;
  platform: Platform;
  handle: string;
  connected: boolean; // false = platform token expired/revoked; needs reconnect
  paused: boolean;
};

export type CategoryKey =
  | 'hate_speech'
  | 'harassment'
  | 'slurs'
  | 'spam'
  | 'self_harm';

export type FilterSettings = {
  sensitivity: Sensitivity;
  categories: Record<CategoryKey, boolean>;
  keywords: string[];
  blockedUsers: string[];
};

export type PlanId = 'free' | 'solo' | 'plus';
export type PaidPlanId = Exclude<PlanId, 'free'>;

export type Plan = {
  id: PlanId;
  name: string;
  maxAccounts: number;
  keywordBlocklist: boolean;
  blockedUsers: boolean;
  popular?: boolean;
  tagline: string;
  features: string[];
};

// ---- Location-based pricing ----

export type PaymentProvider = 'stripe' | 'safepay';

export type PaymentMethod =
  | 'card'
  | 'apple_pay'
  | 'google_pay'
  | 'jazzcash'
  | 'easypaisa'
  | 'bank';

export type BillingInterval = 'monthly' | 'annual';

// per-month figures; annual is the effective monthly price when billed yearly
export type PlanPrice = { monthly: number; annual: number };

export type Region = {
  code: string; // ISO country code, e.g. "PK", "US"
  country: string;
  currency: string; // ISO currency, e.g. "PKR", "USD"
  symbol: string; // "Rs", "$"
  provider: PaymentProvider;
  methods: PaymentMethod[];
  prices: Record<PaidPlanId, PlanPrice>;
};
