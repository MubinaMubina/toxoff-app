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

// What happens to a flagged comment: 'hide' everything (can be restored), 'auto' (the default:
// harassment the AI is at least 85% sure of is deleted, the rest hidden), or 'delete' everything.
export type FlaggedAction = 'hide' | 'auto' | 'delete';

export type FilterSettings = {
  sensitivity: Sensitivity;
  categories: Record<CategoryKey, boolean>;
  keywords: string[];
  blockedUsers: string[];
  flaggedAction: FlaggedAction;
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

export type BillingInterval = 'monthly' | 'annual';
