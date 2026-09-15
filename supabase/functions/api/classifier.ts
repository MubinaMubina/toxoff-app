import type { ModerationReason, Scores } from './moderation.ts';

// Comment classifier: a small GPT model (OPENAI_MODEL, default gpt-5.4-nano) scores each comment
// in any language, including Roman Urdu, Hindi and mixed scripts, which OpenAI's free moderation
// endpoint can't read. If the model is unavailable or answers badly, that free endpoint is the
// fallback. Spam gets an extra signal-based score (links, "DM me", phone numbers) either way.
// To switch to another provider, replace modelScores(); the rest of the pipeline only sees Scores.
//
// Cheap answers come first, so the model only sees comments that need it:
//   1. rules       nothing to read (emoji, @mentions, numbers), obvious spam, or a known slur
//                  (KNOWN_SLURS, the gaali the model scores unevenly): no API call
//   2. moderation  plain English, every word a common one: the free endpoint, and if it is
//                  confidently clean or confidently abusive that's the answer
//   3. model       everything else: other languages and scripts, slang and names the endpoint may
//                  misread, and the grey zone in between

import { containsTerm } from './moderation.ts';

export class ClassifierError extends Error {}

export type ClassifierSource = 'rules' | 'moderation' | 'model' | 'fallback';
export type Classification = { scores: Scores; language: string | null; source: ClassifierSource };

export type ClassifyOptions = {
  /** Runs right before the paid model call and nowhere else, so callers can rate limit just those. */
  beforeModel?: () => Promise<void>;
};

export const DEFAULT_MODEL = 'gpt-5.4-nano';

/** Signal spam this strong (two strong signals) is spam without asking anyone. */
export const OBVIOUS_SPAM = 0.7;
/** Pre-filter: the moderation endpoint's verdict stands outside this band; inside it, the model decides. */
export const CLEAN_BELOW = 0.1;
export const ABUSIVE_FROM = 0.9;
/** A known slur scores this, so it is deleted under the default "auto" action (0.8). */
export const KNOWN_SLUR_SCORE = 0.95;

const SYSTEM_PROMPT = `You score Instagram comments for a creator who wants toxic comments removed. Comments may be in any language or script, including Roman Urdu, Hindi, Punjabi, Arabic, and mixed languages. Read them as a native speaker would, including slang and abuse.
Score each category from 0 to 100 (how sure you are the comment is that thing):
- harassment: insults, bullying, threats, humiliation or unwanted sexual remarks aimed at the creator or another person
- hate_speech: attacks on people for their religion, ethnicity, nationality, gender, sexuality, disability or caste
- slurs: explicit slurs or profane insults (e.g. gaali in Urdu/Hindi), even when joking
- spam: scams, promotions, "DM me", follower selling, links, repeated tagging
- self_harm: encouraging self-harm or suicide (e.g. "kys")
South Asian gaali are slurs however they are spelled and whatever the tone: words like ghasti/gashti, randi, kanjar/kanjri, bhenchod, madarchod, chutiya, gandu, lund, bhosdike, harami score 90 or more on slurs. A comment that is only a gaali, with nothing else, is the strongest case.
Friendly banter, criticism of the content, disagreement, and compliments score low. Answer only with JSON.`;

// Gaali (Roman Urdu / Hindi / Punjabi slurs) the model scores unevenly: "ghasti" alone came back 45.
// Whole-word matches (containsTerm) so "chut" doesn't hit "chutney". Spelling variants are listed
// because Roman script has no fixed spelling; the model's prompt covers the ones this list misses.
export const KNOWN_SLURS = [
  'ghasti', 'gashti', 'gasti', 'ghashti', 'gashtiyan',
  'randi', 'rundi', 'raandi', 'randiyan',
  'kanjar', 'kanjri', 'kanjari',
  'chutiya', 'chutiye', 'chutia', 'chutiyo', 'chut', 'choot',
  'gandu', 'gaandu', 'gand', 'gaand',
  'bhenchod', 'behenchod', 'benchod', 'banchod', 'bhanchod', 'behnchod', 'bhen chod', 'behen chod', 'bhen di',
  'madarchod', 'maderchod', 'madarjaat', 'maa chod', 'motherchod',
  'bhosdike', 'bhosdi', 'bhosda', 'bsdk', 'bkl', 'mkc',
  'lund', 'lawda', 'lawde', 'lauda', 'laude', 'lavda', 'lavde', 'lodu', 'loda', 'lode',
  'harami', 'haramzada', 'haramzadi', 'haramzade', 'haramkhor',
  'kutti', 'kuttiya', 'kutiya',
  'bhadwa', 'bhadwe', 'dalla', 'dalle',
  'chinal', 'chhinal',
];

const CATEGORIES = ['harassment', 'hate_speech', 'slurs', 'spam', 'self_harm'] as const;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...CATEGORIES, 'language'],
  properties: {
    ...Object.fromEntries(CATEGORIES.map((c) => [c, { type: 'integer' }])),
    language: { type: 'string', description: 'The language of the comment, e.g. "Roman Urdu" or "English".' },
  },
};

export async function classify(
  text: string,
  apiKey: string,
  model = DEFAULT_MODEL,
  options: ClassifyOptions = {}
): Promise<Classification> {
  const spam = spamScore(text);

  // 1. Rules: nothing to read, spam by two or more signals, or a known slur.
  if (!hasWords(text) || spam >= OBVIOUS_SPAM) return { scores: { spam }, language: null, source: 'rules' };
  if (hasKnownSlur(text)) return { scores: { slurs: KNOWN_SLUR_SCORE, spam }, language: 'Roman Urdu/Hindi', source: 'rules' };

  // 2. Plain English: the free endpoint reads it well. A clear answer is final; the grey zone goes on.
  let moderation: Scores | null = null;
  if (isPlainEnglish(text)) {
    try {
      moderation = await moderationScores(text, apiKey);
    } catch (e) {
      console.warn('Moderation endpoint failed in the pre-filter, asking the model:', e instanceof Error ? e.message : e);
    }
    if (moderation) {
      const strongest = Math.max(0, ...Object.values(moderation));
      if (strongest < CLEAN_BELOW || strongest >= ABUSIVE_FROM) {
        return withSpam({ scores: moderation, language: 'English', source: 'moderation' }, spam);
      }
    }
  }

  // 3. The model. beforeModel stays outside the try: a rate limit is not a model failure.
  await options.beforeModel?.();
  let result: Classification;
  try {
    result = await modelScores(text, apiKey, model);
  } catch (e) {
    console.warn(`${model} failed, falling back to the moderation endpoint:`, e instanceof Error ? e.message : e);
    result = { scores: moderation ?? (await moderationScores(text, apiKey)), language: null, source: 'fallback' };
  }
  return withSpam(result, spam);
}

function withSpam(result: Classification, spam: number): Classification {
  if (spam > (result.scores.spam ?? 0)) result.scores.spam = spam;
  return result;
}

// ---------- pre-filter helpers ----------

/** True when the comment contains one of KNOWN_SLURS as a whole word, in any case. */
export function hasKnownSlur(text: string): boolean {
  return KNOWN_SLURS.some((slur) => containsTerm(text, slur));
}

/** True when the comment has letters to read once @mentions are set aside; emoji and numbers alone don't count. */
export function hasWords(text: string): boolean {
  return /\p{L}/u.test(text.replace(/@[\w.]+/g, ' '));
}

/**
 * True when every word is a common English word (a-z only, so any other script, accented letters,
 * Roman Urdu, names and slang the endpoint might misread all go to the model). Runs of a letter
 * are collapsed first, so "SIUUUU" and "goooal" still count.
 */
export function isPlainEnglish(text: string): boolean {
  const cleaned = text.replace(/@[\w.]+/g, ' ');
  if (/(?![a-zA-Z])\p{L}/u.test(cleaned)) return false;
  const words = cleaned
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map((w) => w.replace(/([a-z])\1{2,}/g, '$1'));
  return words.length > 0 && words.every((w) => ENGLISH_WORDS.has(w));
}

// Common English words plus the slang that fills a creator's comments. Missing words are not a
// problem: a comment with an unknown word simply goes to the model.
const ENGLISH_WORDS = new Set(
  `a about absolutely actually admire after again ago agree ah all almost alone already also always am amazing an and
  angel another answer any anyone anything are around as ask at awesome away awful baby back bad be beast beautiful
  because been before behind being believe best better big birthday bit bless blessed body boring born boss both boy
  bro brother but buy by bye came can cant care champion cheers class clean club come comment congrats congratulations
  cool could couldnt crazy cringe cry cute dad damn day days dear delete did didnt die do does doesnt dont done dope
  down dream dude dumb each early eat elite end enjoy enough ever every everyone everything exactly excellent eyes face
  facts fake family fan fans fantastic far fat father fav favorite favourite feel fine finally fire first follow
  followed follower followers for forever forget forward fr free friend friends from fun funny game games gave get
  gets getting girl give glad go goal goals goat god going gone gonna good goodbye got great greatest guy guys ha
  haha had hair happy hard has hate have having he hear heart hello help her here hero hes hey hi him his home honestly
  hope hot how huge hungry i icon idiot idol if ill im in incredible insane inspiration inspiring is isnt it its ive
  joke just keep kid kids killed killing king know l last late later laugh lazy learn legend legendary less let lets
  life like liked lit literally little live lmao lol long look looking looks loser lot love loved lovely lover
  loves lucky mad made magic make man many masterpiece match may maybe me mean men mine miss mom moment money more
  morning most mother much must my myself name nah need never new next nice night no nobody not nothing now of off
  oh ok okay old omg on once one only or other our out over own part peace people perfect person photo pic pick
  picture play played player please pls post pretty proud queen quit real really respect rest right rip rn sad said
  same saw say see seen serious seriously she shes should shut sick simply sis sister siu so some someone something
  song soon sorry speech star stay still stop story strong stupid such super support sure take talk team tell thank
  thanks that thats the their them then there these they theyre thing things think this those time to today tomorrow
  too top total totally trash true truly try tv ugh ugly unreal up us useless very vibes video view w wait want was
  wasnt watch watching way we week welcome well went were what whats when where which who whole why wife will win
  winner with woman women won wonderful wont word work world worst would wouldnt wow yeah year years yes yet you
  young your youre yours yourself yup`.split(/\s+/)
);

async function modelScores(text: string, apiKey: string, model: string): Promise<Classification> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      reasoning_effort: 'low', // "none" misses milder abuse; "low" costs a few more tokens and a second
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'scores', strict: true, schema: RESPONSE_SCHEMA } },
    }),
  });
  if (!res.ok) throw new ClassifierError(`${model} failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new ClassifierError(`${model} returned no content`);
  const parsed = JSON.parse(content);
  const scores: Scores = {};
  for (const category of CATEGORIES) {
    const value = Number(parsed[category]);
    if (Number.isFinite(value)) scores[category] = Math.min(1, Math.max(0, value / 100));
  }
  if (!Object.keys(scores).length) throw new ClassifierError(`${model} returned no scores`);
  const language = typeof parsed.language === 'string' && parsed.language.trim() ? parsed.language.trim().slice(0, 40) : null;
  return { scores, language, source: 'model' };
}

// ---------- fallback: OpenAI's free moderation endpoint (English-centric) ----------

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

export async function moderationScores(text: string, apiKey: string): Promise<Scores> {
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

// ---------- spam signals ----------

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
