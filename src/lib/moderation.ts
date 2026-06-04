import { CategoryKey, FilterSettings, ModerationReason } from '../types';

/**
 * AI moderation entry point.
 *
 * In production this calls your classifier endpoint (OpenAI moderation API or a
 * custom multilingual model) which returns per-category scores. The client then
 * applies the user's sensitivity threshold, enabled categories, keyword
 * blocklist and blocked-user list to decide whether to remove the comment.
 *
 * Wire it up by replacing the body of `classifyComment` with a fetch to
 * `${EXPO_PUBLIC_API_BASE_URL}/moderate`. The shape below is what the UI expects.
 */

export type ClassifierScores = Partial<Record<ModerationReason, number>>;

export type ModerationDecision = {
  remove: boolean;
  reason: ModerationReason | null;
  confidence: number;
};

const SENSITIVITY_THRESHOLD = { low: 0.85, medium: 0.6, high: 0.4 } as const;

const REASON_TO_CATEGORY: Record<ModerationReason, CategoryKey | null> = {
  hate_speech: 'hate_speech',
  harassment: 'harassment',
  slurs: 'slurs',
  spam: 'spam',
  self_harm: 'self_harm',
  toxicity: null, // toxicity is always evaluated, not a toggleable category
};

export async function classifyComment(
  text: string,
  scores: ClassifierScores
): Promise<ClassifierScores> {
  // TODO: replace with real endpoint call.
  // const res = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/moderate`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ text }),
  // });
  // return (await res.json()).scores;
  return scores;
}

/** Pure decision logic — unit-testable and shared between mock + live data. */
export function decide(
  text: string,
  username: string,
  scores: ClassifierScores,
  filters: FilterSettings
): ModerationDecision {
  const lower = text.toLowerCase();

  // Hard rules first: blocked users and keyword blocklist.
  if (filters.blockedUsers.some((u) => u.toLowerCase() === username.toLowerCase())) {
    return { remove: true, reason: 'harassment', confidence: 1 };
  }
  const hitKeyword = filters.keywords.find((k) => lower.includes(k.toLowerCase()));
  if (hitKeyword) {
    return { remove: true, reason: 'slurs', confidence: 1 };
  }

  const threshold = SENSITIVITY_THRESHOLD[filters.sensitivity];
  let bestReason: ModerationReason | null = null;
  let bestScore = 0;

  for (const reason of Object.keys(scores) as ModerationReason[]) {
    const category = REASON_TO_CATEGORY[reason];
    if (category && !filters.categories[category]) continue; // category disabled
    const score = scores[reason] ?? 0;
    if (score >= threshold && score > bestScore) {
      bestReason = reason;
      bestScore = score;
    }
  }

  if (bestReason) {
    return { remove: true, reason: bestReason, confidence: bestScore };
  }
  return { remove: false, reason: null, confidence: 0 };
}
