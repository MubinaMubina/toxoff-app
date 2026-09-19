import { ConnectedAccount, FilterSettings, RemovedComment } from '../types';
import { DEFAULT_FLAGGED_ACTION, DEFAULT_SENSITIVITY } from './moderationDefaults';

// Relative to app launch so the demo feed always looks recent.
const NOW = Date.now();
const min = (n: number) => new Date(NOW - n * 60_000).toISOString();
const hr = (n: number) => new Date(NOW - n * 3_600_000).toISOString();
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

export const MOCK_ACCOUNTS: ConnectedAccount[] = [
  {
    id: 'acc_ig',
    platform: 'instagram',
    handle: '@yourbrand',
    connected: true,
    paused: false,
  },
];

export const MOCK_FREE_COMMENTS_USED = 12;

export const DEFAULT_FILTERS: FilterSettings = {
  sensitivity: DEFAULT_SENSITIVITY,
  categories: {
    hate_speech: true,
    harassment: true,
    slurs: true,
    spam: false, // opt-in: the spam check is signal-based and can catch genuine comments
    self_harm: true,
  },
  keywords: ['scamlink.biz', 'free followers'],
  blockedUsers: ['troll_acct_99'],
  flaggedAction: DEFAULT_FLAGGED_ACTION,
};

export const MOCK_REMOVED: RemovedComment[] = [
  {
    id: 'c1', platform: 'instagram', username: 'hatekeyboard_warrior',
    text: 'You are absolutely disgusting and should not be allowed online 🤮',
    reason: 'harassment', confidence: 0.94, language: 'English', postRef: 'Reel · Summer drop',
    createdAt: min(4), action: 'deleted', // auto: harassment at 80%+ is deleted
  },
  {
    id: 'c2', platform: 'tiktok', username: 'spambot_4471',
    text: 'Get 10k FREE followers now 👉 scamlink.biz/claim',
    reason: 'spam', confidence: 0.99, language: 'English', postRef: 'Video · Dance clip',
    createdAt: min(18),
  },
  {
    id: 'c3', platform: 'instagram', username: 'anon_user_22',
    text: 'Eres una basura, nadie te quiere aquí',
    reason: 'hate_speech', confidence: 0.88, language: 'Spanish', postRef: 'Post · Behind the scenes',
    createdAt: min(52),
  },
  {
    id: 'c4', platform: 'tiktok', username: 'gymrat_x',
    text: 'kys nobody asked for your opinion',
    reason: 'self_harm', confidence: 0.91, language: 'English', postRef: 'Video · Q&A',
    createdAt: hr(2),
  },
  {
    id: 'c5', platform: 'instagram', username: 'troll_acct_99',
    text: 'back again with another L take 💀💀',
    reason: 'harassment', confidence: 1, language: 'English', postRef: 'Reel · Opinion',
    createdAt: hr(5), action: 'deleted',
  },
  {
    id: 'c6', platform: 'tiktok', username: 'random_hater',
    text: 'これは本当にひどい、消えてほしい',
    reason: 'toxicity', confidence: 0.82, language: 'Japanese', postRef: 'Video · Travel',
    createdAt: hr(9),
  },
  {
    id: 'c7', platform: 'instagram', username: 'crypto_promo_99',
    text: 'DM me to double your money in 24h 💰💰💰',
    reason: 'spam', confidence: 0.97, language: 'English', postRef: 'Post · Giveaway',
    createdAt: day(1),
  },
  {
    id: 'c8', platform: 'tiktok', username: 'edgy_lord',
    text: 'using a slur here that the classifier caught',
    reason: 'slurs', confidence: 0.96, language: 'English', postRef: 'Video · Stitch',
    createdAt: day(2),
  },
  {
    id: 'c9', platform: 'instagram', username: 'mean_comment_acc',
    text: 'Du bist so hässlich, lösch dein Konto',
    reason: 'hate_speech', confidence: 0.86, language: 'German', postRef: 'Reel · Makeup',
    createdAt: day(3),
  },
  {
    id: 'c10', platform: 'tiktok', username: 'rage_bait_22',
    text: 'this is the worst content I have ever seen, quit',
    reason: 'toxicity', confidence: 0.78, language: 'English', postRef: 'Video · Cooking',
    createdAt: day(6),
  },
  {
    id: 'c11', platform: 'instagram', username: 'spam_shop_official',
    text: 'CHEAP designer bags link in bio 🔥 free followers too',
    reason: 'spam', confidence: 0.95, language: 'English', postRef: 'Post · Outfit',
    createdAt: day(12),
  },
  {
    id: 'c12', platform: 'tiktok', username: 'toxic_troll_5',
    text: 'personne ne se soucie de toi, arrête',
    reason: 'harassment', confidence: 0.83, language: 'French', postRef: 'Video · Vlog',
    createdAt: day(20),
  },
];

export const REASON_LABELS: Record<string, string> = {
  hate_speech: 'Hate speech',
  harassment: 'Harassment',
  slurs: 'Slurs',
  spam: 'Spam',
  self_harm: 'Self-harm',
  toxicity: 'Toxicity',
};
