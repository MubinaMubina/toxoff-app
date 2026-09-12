import type { ModerationReason, Scores } from './moderation.ts';

// Comment classifier: OpenAI's moderation endpoint (free). It has no spam or language detection,
// so spam comes from spamScore() below. To switch to another classifier (e.g. an LLM), replace
// classify() — the rest of the pipeline only sees Scores.

export class ClassifierError extends Error {}

const OPENAI_CATEGORIES: Record<string, ModerationReason> = {
  'hate': 'hate_speech',
  'hate/threatening': 'hate_speech',
  'harassment': 'harassment',
  'harassment/threatening': 'harassment',
  'sexual': 'harassment', // unwanted sexual comments aimed at a creator
  'self-harm': 'self_harm',
  'self-harm/intent': 'self_harm',
  'self-harm/instructions': 'self_harm',
  'violence/graphic': 'toxicity',
  'sexual/minors': 'toxicity',
  // 'violence' and 'illicit' are left out: they flag news and discussion, not attacks.
  // Threats against the creator score as harassment/threatening.
};

export async function classify(text: string, apiKey: string): Promise<Scores> {
  const scores = await openAIScores(text, apiKey);
  const spam = spamScore(text);
  if (spam > 0) scores.spam = spam;
  return scores;
}

async function openAIScores(text: string, apiKey: string): Promise<Scores> {
  const res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
  });
  if (!res.ok) {
    throw new ClassifierError(`OpenAI moderation failed (${res.status}): ${await res.text()}`);
  }
  const body = await res.json();
  const raw: Record<string, number> = body.results?.[0]?.category_scores ?? {};
  const scores: Scores = {};
  for (const [category, score] of Object.entries(raw)) {
    const reason = OPENAI_CATEGORIES[category];
    if (reason && score > (scores[reason] ?? 0)) scores[reason] = score;
  }
  return scores;
}

// Each signal adds to the score; one alone stays under the default (medium, 0.6) threshold.
const SPAM_SIGNALS: [RegExp, number][] = [
  // links
  [/https?:\/\/|www\.|\bbit\.ly\b|\b[a-z0-9-]+\.(com|net|org|io|shop|store|link|xyz|site|online)\b/i, 0.45],
  // "DM me", "check my bio"
  [/\b(dm|inbox|message) (me|us)\b|\bcheck (out )?(my|our) (bio|page|profile|account)\b|\blink in (my |the )?bio\b/i, 0.35],
  // promotion, money, crypto
  [/\b(promo(tion)?|promote|sponsor(ship)?|giveaway|free followers|buy followers|earn \$?\d+|make money|invest(ment)? now|crypto|bitcoin|forex|trading signals|onlyfans)\b/i, 0.35],
  // messaging apps and phone numbers
  [/\b(whats ?app|telegram|wa\.me|t\.me)\b|\+?\d[\d\s-]{9,}\d/i, 0.4],
  // tagging lots of accounts
  [/(@[\w.]+[^@]*){3,}/, 0.3],
];

export function spamScore(text: string): number {
  const total = SPAM_SIGNALS.reduce((sum, [pattern, weight]) => sum + (pattern.test(text) ? weight : 0), 0);
  return Math.min(0.95, Math.round(total * 100) / 100);
}
