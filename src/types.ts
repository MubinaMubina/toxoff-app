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
  action?: 'hidden' | 'deleted'; // missing = hidden; deleted ones can't be restored
  erased?: boolean; // a deleted comment whose text was erased from the log for good; not shown
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

// What happens to a flagged comment: 'auto' (the default: anything toxic the AI is at least 80%
// sure of is deleted for good, spam excepted, the rest hidden), 'hide' everything (can be
// restored), or 'delete' everything.
export type FlaggedAction = 'hide' | 'auto' | 'delete';

export type FilterSettings = {
  sensitivity: Sensitivity;
  categories: Record<CategoryKey, boolean>;
  keywords: string[];
  blockedUsers: string[];
  flaggedAction: FlaggedAction;
};

// Onboarding answers (app/onboarding.tsx), kept on the profile. All changeable later in Settings.
export type Persona = 'creator' | 'business' | 'public_figure' | 'manager';
/** What the Log shows. Home always keeps comment text out of sight. */
export type LogVisibility = 'all' | 'conceal_deleted' | 'count_only';
/** Erase deleted comments from the log for good after this many days; null = never. */
export type AutoEraseDays = 7 | 30 | null;
/** A push for every removed comment, one daily summary, or none. */
export type NotificationMode = 'each' | 'daily' | 'none';

export type PlanId = 'free' | 'solo' | 'plus' | 'studio';
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

export type BillingInterval = 'monthly' | 'annual';
