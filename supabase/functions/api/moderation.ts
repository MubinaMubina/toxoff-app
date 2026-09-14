// Decides whether a comment is hidden, from classifier scores and the user's filters.
// Mirrors the choices in the app's Filters screen (src/types.ts has the same unions).

export type ModerationReason =
  | 'hate_speech'
  | 'harassment'
  | 'slurs'
  | 'spam'
  | 'self_harm'
  | 'toxicity';

export type CategoryKey = Exclude<ModerationReason, 'toxicity'>;
export type Sensitivity = 'low' | 'medium' | 'high';
export type Scores = Partial<Record<ModerationReason, number>>;

export type FilterSettings = {
  sensitivity: Sensitivity;
  categories: Partial<Record<CategoryKey, boolean>>; // missing = on
  keywords: string[];
  blockedUsers: string[]; // usernames without @
};

export type Decision = {
  remove: boolean;
  reason: ModerationReason | null;
  confidence: number;
  byRule?: boolean; // a blocked user or keyword, not the AI's score
};

const THRESHOLD: Record<Sensitivity, number> = { low: 0.85, medium: 0.6, high: 0.4 };

// What happens to a flagged comment (Filters screen, filters.flagged_action):
//   hide    every flagged comment is hidden (it can be restored)
//   auto    the default: harassment the AI is at least 85% sure of is deleted, the rest is hidden
//   delete  every flagged comment is deleted
export type FlaggedAction = 'hide' | 'auto' | 'delete';
export const AUTO_DELETE_THRESHOLD = 0.85;

export function chooseAction(decision: Decision, mode: FlaggedAction): 'hide' | 'delete' {
  if (mode === 'delete') return 'delete';
  if (mode === 'auto' && decision.reason === 'harassment' && !decision.byRule && decision.confidence >= AUTO_DELETE_THRESHOLD) {
    return 'delete';
  }
  return 'hide';
}

// Toxicity is always evaluated; the others follow the user's category toggles.
const REASON_TO_CATEGORY: Record<ModerationReason, CategoryKey | null> = {
  hate_speech: 'hate_speech',
  harassment: 'harassment',
  slurs: 'slurs',
  spam: 'spam',
  self_harm: 'self_harm',
  toxicity: null,
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word, case-insensitive match in any script, so "ass" doesn't hide "class". */
export function containsTerm(text: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(t)}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

export function decide(
  text: string,
  username: string,
  scores: Scores,
  filters: FilterSettings
): Decision {
  // Hard rules first: blocked users and the keyword blocklist.
  const author = username.replace(/^@/, '').toLowerCase();
  if (filters.blockedUsers.some((u) => u.replace(/^@/, '').toLowerCase() === author)) {
    return { remove: true, reason: 'harassment', confidence: 1, byRule: true };
  }
  if (filters.keywords.some((k) => containsTerm(text, k))) {
    return { remove: true, reason: 'slurs', confidence: 1, byRule: true };
  }

  const threshold = THRESHOLD[filters.sensitivity] ?? THRESHOLD.medium;
  let best: Decision = { remove: false, reason: null, confidence: 0 };
  for (const reason of Object.keys(scores) as ModerationReason[]) {
    const category = REASON_TO_CATEGORY[reason];
    if (category && filters.categories[category] === false) continue;
    const score = scores[reason] ?? 0;
    if (score >= threshold && score > best.confidence) {
      best = { remove: true, reason, confidence: score };
    }
  }
  return best;
}
