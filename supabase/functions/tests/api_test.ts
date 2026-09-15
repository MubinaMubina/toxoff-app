// Unit tests for the api function's pure parts. Run:
//   deno test --allow-env --config supabase/functions/api/deno.json supabase/functions/tests
import { assert, assertEquals, assertRejects, assertThrows } from '@std/assert';
import { billingState, lookupKey, planOfPrice } from '../api/billing.ts';
import { ClassifierError, classify, hasKnownSlur, hasWords, isPlainEnglish, KNOWN_SLUR_SCORE, spamScore } from '../api/classifier.ts';
import { describeScores } from '../api/pipeline.ts';
import { requireConfirmation } from '../api/account.ts';
import { ERASED, eraseSelection } from '../api/comments.ts';
import { summaryMessage } from '../api/cron.ts';
import { HttpError } from '../api/http.ts';
import { safeEqual, seal, unseal, verifyHmacSha256 } from '../api/crypto.ts';
import {
  authorizeUrl,
  commentEvents,
  deleteComment,
  exchangeCode,
  InstagramError,
  parseTime,
  polledCommentEvents,
  recentComments,
  recentMediaWithComments,
  setCommentHidden,
} from '../api/instagram.ts';
import { COOL_INTERVAL_MS, HOT_INTERVAL_MS, latestPostAt, pollDue } from '../api/poll.ts';
import { AUTO_DELETE_THRESHOLD, chooseAction, containsTerm, decide, type FilterSettings } from '../api/moderation.ts';
import { eventUsers, planOfProduct, storeBillingState } from '../api/store.ts';
import {
  createCustomer,
  formEncode,
  pricesByLookupKey,
  StripeError,
  type Subscription,
  updateSubscription,
  verifyWebhook,
} from '../api/stripe.ts';

const FILTERS: FilterSettings = {
  sensitivity: 'medium',
  categories: {},
  keywords: [],
  blockedUsers: [],
};

// Replaces fetch for one test; returns the requests it saw.
function stubFetch(respond: (url: URL, init?: RequestInit) => Response) {
  const original = globalThis.fetch;
  const calls: { url: URL; init?: RequestInit }[] = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push({ url, init });
    return Promise.resolve(respond(url, init));
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

Deno.test('decide: blocked users and keywords win, case-insensitive, with or without @', () => {
  const f = { ...FILTERS, blockedUsers: ['@Troll99'], keywords: ['scam'] };
  assertEquals(decide('hi', 'troll99', {}, f), { remove: true, reason: 'harassment', confidence: 1, byRule: true });
  assertEquals(decide('total SCAM!', 'fan', {}, f), { remove: true, reason: 'slurs', confidence: 1, byRule: true });
  assertEquals(decide('scampi recipe please', 'fan', {}, f).remove, false);
});

Deno.test('decide: sensitivity thresholds and the strongest reason', () => {
  const scores = { harassment: 0.7, hate_speech: 0.65 };
  assertEquals(decide('x', 'u', scores, FILTERS), { remove: true, reason: 'harassment', confidence: 0.7 });
  assertEquals(decide('x', 'u', scores, { ...FILTERS, sensitivity: 'low' }).remove, false);
  assertEquals(decide('x', 'u', { spam: 0.45 }, { ...FILTERS, sensitivity: 'high' }).reason, 'spam');
  assertEquals(decide('x', 'u', { spam: 0.35 }, { ...FILTERS, sensitivity: 'high' }).remove, false);
});

Deno.test('decide: turned-off categories are skipped, toxicity always counts', () => {
  const off = { ...FILTERS, categories: { harassment: false } };
  assertEquals(decide('x', 'u', { harassment: 0.99 }, off).remove, false);
  assertEquals(decide('x', 'u', { harassment: 0.99, hate_speech: 0.7 }, off).reason, 'hate_speech');
  assertEquals(decide('x', 'u', { toxicity: 0.9 }, { ...FILTERS, categories: { hate_speech: false } }).reason, 'toxicity');
});

Deno.test('containsTerm: whole words in any script, phrases and emoji', () => {
  assert(containsTerm('You are an ASS', 'ass'));
  assert(!containsTerm('first class', 'ass'));
  assert(containsTerm('تم بہت برے ہو', 'برے'));
  assert(!containsTerm('بریانی', 'بر'));
  assert(containsTerm('go back home now', 'go back home'));
  assert(containsTerm('🐍🐍 lol', '🐍'));
  assert(containsTerm('what (a) joke', '(a)'));
  assert(!containsTerm('anything', '   '));
});

Deno.test('spamScore: one signal stays under the default threshold, two go over', () => {
  assertEquals(spamScore('love this outfit 😍'), 0);
  assert(spamScore('check my bio') < 0.6);
  assert(spamScore('DM me for promo, link in bio www.cheapfollowers.shop') >= 0.6);
  assert(spamScore('Earn $500 daily with crypto, WhatsApp +92 300 1234567') >= 0.6);
  assert(spamScore('a'.repeat(50)) === 0);
});

const modelAnswer = (scores: Record<string, number>, language = 'Roman Urdu') =>
  Response.json({ choices: [{ message: { content: JSON.stringify({ harassment: 0, hate_speech: 0, slurs: 0, spam: 0, self_harm: 0, language, ...scores }) } }], usage: {} });

const moderationAnswer = (scores: Record<string, number>) => Response.json({ results: [{ category_scores: scores }] });

Deno.test('classify: asks the GPT model for scores in any language, adds the spam signal', async () => {
  const stub = stubFetch(() => modelAnswer({ harassment: 45, slurs: 60 }));
  try {
    const { scores, language, source } = await classify('Kia chutiyapa hai, check my bio', 'sk-test');
    assertEquals([scores.harassment, scores.slurs, scores.hate_speech, scores.self_harm], [0.45, 0.6, 0, 0]);
    assertEquals(scores.spam, 0.35); // the signal score wins over the model's 0
    assertEquals([language, source], ['Roman Urdu', 'model']);
    const call = stub.calls[0];
    assertEquals(call.url.href, 'https://api.openai.com/v1/chat/completions');
    assertEquals(new Headers(call.init?.headers).get('Authorization'), 'Bearer sk-test');
    const body = JSON.parse(String(call.init?.body));
    assertEquals([body.model, body.reasoning_effort, body.response_format.type, body.messages[1].content], ['gpt-5.4-nano', 'low', 'json_schema', 'Kia chutiyapa hai, check my bio']);
    assertEquals(stub.calls.length, 1); // no pre-filter call: Roman Urdu goes straight to the model
  } finally {
    stub.restore();
  }
});

Deno.test('classify: falls back to the moderation endpoint when the model fails', async () => {
  const stub = stubFetch((url) =>
    url.pathname === '/v1/chat/completions'
      ? new Response('overloaded', { status: 503 })
      : moderationAnswer({ 'harassment/threatening': 0.8, 'hate': 0.1, 'violence': 0.99 })
  );
  try {
    const { scores, language, source } = await classify('threat', 'sk-test', 'gpt-5.4-mini');
    assertEquals([scores.harassment, scores.hate_speech, scores.toxicity, language, source], [0.8, 0.1, undefined, null, 'fallback']);
    assertEquals(stub.calls.map((c) => c.url.pathname), ['/v1/chat/completions', '/v1/moderations']);
  } finally {
    stub.restore();
  }
});

Deno.test('classify: errors from both are thrown so the comment is retried later', async () => {
  const stub = stubFetch(() => new Response('down', { status: 503 }));
  try {
    await assertRejects(() => classify('hi', 'sk-test'), ClassifierError);
  } finally {
    stub.restore();
  }
});

Deno.test('classify: emoji, @mentions and obvious spam are settled by rules, no API call', async () => {
  const stub = stubFetch(() => new Response('should not be called', { status: 500 }));
  try {
    let beforeModelCalls = 0;
    const beforeModel = () => Promise.resolve(void beforeModelCalls++);
    assertEquals(await classify('@bestie @friend 🔥🔥 ❤️', 'sk-test', undefined, { beforeModel }), { scores: { spam: 0 }, language: null, source: 'rules' });
    assertEquals(await classify('1000', 'sk-test'), { scores: { spam: 0 }, language: null, source: 'rules' });
    const spam = await classify('DM me for promo, link in bio www.cheapfollowers.shop', 'sk-test', undefined, { beforeModel });
    assertEquals([spam.source, spam.language], ['rules', null]);
    assert((spam.scores.spam ?? 0) >= 0.7);
    assertEquals([stub.calls.length, beforeModelCalls], [0, 0]);
  } finally {
    stub.restore();
  }
});

Deno.test('classify: a known gaali is a slur by rule, scored above the auto-delete line, no API call', async () => {
  const stub = stubFetch(() => new Response('should not be called', { status: 500 }));
  try {
    let beforeModelCalls = 0;
    const beforeModel = () => Promise.resolve(void beforeModelCalls++);
    const settled = { scores: { slurs: KNOWN_SLUR_SCORE, spam: 0 }, language: 'Roman Urdu/Hindi', source: 'rules' as const };
    assertEquals(await classify('ghasti', 'sk-test', undefined, { beforeModel }), settled);
    assertEquals(await classify('Tu ek RANDI hai 😂', 'sk-test', undefined, { beforeModel }), settled);
    assertEquals(await classify('kia banchod baat hai', 'sk-test', undefined, { beforeModel }), settled);
    assert(KNOWN_SLUR_SCORE >= AUTO_DELETE_THRESHOLD);
    assertEquals(chooseAction(decide('ghasti', 'troll', settled.scores, FILTERS), 'auto'), 'delete');
    assertEquals([stub.calls.length, beforeModelCalls], [0, 0]);
    // Whole words only: no false hits inside other words.
    assertEquals(hasKnownSlur('chutney recipe'), false);
    assertEquals(hasKnownSlur('bhai ye kia khotapani hai xD'), false);
    assertEquals(hasKnownSlur('CHUT'), true);
  } finally {
    stub.restore();
  }
});

Deno.test('describeScores: strongest first, whole percentages, "none" when empty', () => {
  assertEquals(describeScores({ harassment: 0.4, slurs: 0.95, spam: 0 }), 'slurs 95, harassment 40');
  assertEquals(describeScores({}), 'none');
});

Deno.test('classify: plain English takes the free endpoint when it is sure either way', async () => {
  const stub = stubFetch((url) =>
    url.pathname === '/v1/moderations'
      ? moderationAnswer({ harassment: 0.001, hate: 0.0002, 'self-harm': 0.0001, violence: 0.3 })
      : new Response('model should not be called', { status: 500 })
  );
  try {
    const clean = await classify('SIUUUU 🐐 best player ever', 'sk-test');
    assertEquals([clean.source, clean.language, clean.scores.harassment, clean.scores.spam], ['moderation', 'English', 0.001, undefined]);
    assertEquals(stub.calls.map((c) => c.url.pathname), ['/v1/moderations']);
    assertEquals(JSON.parse(String(stub.calls[0].init?.body)).input, 'SIUUUU 🐐 best player ever');
  } finally {
    stub.restore();
  }
  const abusive = stubFetch((url) =>
    url.pathname === '/v1/moderations'
      ? moderationAnswer({ harassment: 0.97, 'harassment/threatening': 0.2, hate: 0.01 })
      : new Response('model should not be called', { status: 500 })
  );
  try {
    const result = await classify('you are a stupid ugly loser', 'sk-test');
    assertEquals([result.source, result.language, result.scores.harassment, result.scores.hate_speech], ['moderation', 'English', 0.97, 0.01]);
    assertEquals(abusive.calls.length, 1);
  } finally {
    abusive.restore();
  }
});

Deno.test('classify: the grey zone and anything not plain English go to the model', async () => {
  const stub = stubFetch((url) =>
    url.pathname === '/v1/moderations' ? moderationAnswer({ harassment: 0.5 }) : modelAnswer({ harassment: 80 }, 'English')
  );
  try {
    let beforeModelCalls = 0;
    const beforeModel = () => Promise.resolve(void beforeModelCalls++);
    const grey = await classify('you are so fat', 'sk-test', undefined, { beforeModel });
    assertEquals([grey.source, grey.scores.harassment, beforeModelCalls], ['model', 0.8, 1]);
    assertEquals(stub.calls.map((c) => c.url.pathname), ['/v1/moderations', '/v1/chat/completions']);

    stub.calls.length = 0;
    await classify('you are a kutta', 'sk-test', undefined, { beforeModel }); // one unknown word is enough
    await classify('tum bahut ganday ho', 'sk-test', undefined, { beforeModel });
    await classify('تم بہت برے ہو', 'sk-test', undefined, { beforeModel });
    assertEquals(stub.calls.map((c) => c.url.pathname), ['/v1/chat/completions', '/v1/chat/completions', '/v1/chat/completions']);
    assertEquals(beforeModelCalls, 4);
  } finally {
    stub.restore();
  }
});

Deno.test('classify: a failing pre-filter call is skipped, a failing beforeModel is not', async () => {
  const stub = stubFetch((url) =>
    url.pathname === '/v1/moderations' ? new Response('down', { status: 503 }) : modelAnswer({ harassment: 10 }, 'English')
  );
  try {
    const result = await classify('best player ever', 'sk-test');
    assertEquals([result.source, result.scores.harassment], ['model', 0.1]);
    assertEquals(stub.calls.map((c) => c.url.pathname), ['/v1/moderations', '/v1/chat/completions']);

    stub.calls.length = 0;
    class Limited extends Error {}
    await assertRejects(() => classify('tum bahut ganday ho', 'sk-test', undefined, { beforeModel: () => Promise.reject(new Limited()) }), Limited);
    assertEquals(stub.calls.length, 0); // no fallback call either: the comment is simply retried later
  } finally {
    stub.restore();
  }
});

Deno.test('hasWords / isPlainEnglish: what the pre-filter can settle without the model', () => {
  assert(hasWords('nice'));
  assert(!hasWords('@friend @bestie 🔥 123'));
  assert(hasWords('#loser'));
  assert(isPlainEnglish("You're the best, love you!!! 😍"));
  assert(isPlainEnglish('GOOOOAL SIUUU'));
  assert(isPlainEnglish('@ronaldo best player ever'));
  assert(!isPlainEnglish('you are a kutta'));
  assert(!isPlainEnglish('eres el mejor'));
  assert(!isPlainEnglish('café'));
  assert(!isPlainEnglish('تم بہت برے ہو'));
  assert(!isPlainEnglish('🔥🔥'));
});

Deno.test('commentEvents: reads comments and replies, ignores everything else', () => {
  const events = commentEvents({
    object: 'instagram',
    entry: [
      {
        id: '17841400000000001',
        time: 1,
        changes: [
          {
            field: 'comments',
            value: {
              id: '180001',
              text: 'first',
              from: { id: '99', username: 'fan' },
              media: { id: 'm1', media_product_type: 'REELS' },
            },
          },
          { field: 'comments', value: { id: '180002', text: 'reply', parent_id: '180001', from: { id: '98', username: 'other' } } },
          { field: 'mentions', value: { comment_id: 'x' } },
          { field: 'comments', value: { id: '180003' } }, // no text
        ],
      },
    ],
  });
  assertEquals(events, [
    { accountId: '17841400000000001', commentId: '180001', text: 'first', authorId: '99', authorUsername: 'fan', mediaId: 'm1', mediaType: 'REELS' },
    { accountId: '17841400000000001', commentId: '180002', text: 'reply', authorId: '98', authorUsername: 'other', mediaId: null, mediaType: null },
  ]);
  assertEquals(commentEvents({ object: 'page', entry: [] }), []);
  assertEquals(commentEvents(null), []);
});

Deno.test('parseTime reads Instagram timestamps', () => {
  assertEquals(parseTime('2026-09-14T10:00:00+0000'), Date.UTC(2026, 8, 14, 10));
  assertEquals(parseTime('2026-09-14T15:00:00+0500'), Date.UTC(2026, 8, 14, 10));
  assertEquals(parseTime('2026-09-14T10:00:00Z'), Date.UTC(2026, 8, 14, 10));
});

Deno.test('polledCommentEvents: new, visible comments and replies by others, oldest first', () => {
  const since = Date.UTC(2026, 8, 14, 10);
  const at = (minutes: number) => new Date(since + minutes * 60_000).toISOString().replace('.000Z', '+0000');
  const events = polledCommentEvents(
    { platformUserId: '1784', handle: '@MyShop' },
    { id: 'm1', media_product_type: 'REELS' },
    [
      {
        id: 'c3',
        text: 'newest',
        timestamp: at(9),
        from: { id: '99', username: 'fan' },
        replies: {
          data: [
            { id: 'r1', text: 'reply', timestamp: at(10), from: { id: '98', username: 'other' } },
            { id: 'r2', text: 'thanks!', timestamp: at(11), from: { id: '1784', username: 'myshop' } }, // own reply
          ],
        },
      },
      { id: 'c2', text: 'already hidden', timestamp: at(5), hidden: true, from: { id: '97', username: 'x' } },
      { id: 'c1', text: 'first', timestamp: at(1), username: 'legacy' }, // no `from`
      { id: 'c0', text: 'before the cursor', timestamp: at(-1), from: { id: '96', username: 'y' } },
      { id: 'c4', timestamp: at(2) }, // no text
    ],
    since
  );
  assertEquals(events, [
    { accountId: '1784', commentId: 'c1', text: 'first', authorId: null, authorUsername: 'legacy', mediaId: 'm1', mediaType: 'REELS' },
    { accountId: '1784', commentId: 'c3', text: 'newest', authorId: '99', authorUsername: 'fan', mediaId: 'm1', mediaType: 'REELS' },
    { accountId: '1784', commentId: 'r1', text: 'reply', authorId: '98', authorUsername: 'other', mediaId: 'm1', mediaType: 'REELS' },
  ]);
});

Deno.test('pollDue: never-read and hot accounts every run, cool ones every minute, backed-off ones not at all', () => {
  const now = Date.UTC(2026, 8, 15, 12);
  const ago = (ms: number) => new Date(now - ms).toISOString();
  assertEquals(pollDue({ comments_polled_at: null, latest_post_at: null, poll_backoff_until: null }, now), true);
  // Hot: a post 10 minutes old; read again after 30 seconds (with 5 seconds of slack), not after 20.
  assertEquals(pollDue({ comments_polled_at: ago(26_000), latest_post_at: ago(10 * 60_000), poll_backoff_until: null }, now), true);
  assertEquals(pollDue({ comments_polled_at: ago(20_000), latest_post_at: ago(10 * 60_000), poll_backoff_until: null }, now), false);
  // Cool: newest post 3 hours old (or unknown); once a minute.
  assertEquals(pollDue({ comments_polled_at: ago(30_000), latest_post_at: ago(3 * 60 * 60_000), poll_backoff_until: null }, now), false);
  assertEquals(pollDue({ comments_polled_at: ago(56_000), latest_post_at: ago(3 * 60 * 60_000), poll_backoff_until: null }, now), true);
  assertEquals(pollDue({ comments_polled_at: ago(30_000), latest_post_at: null, poll_backoff_until: null }, now), false);
  // Backed off after a Meta rate limit, even if never read; due again once it passes.
  assertEquals(pollDue({ comments_polled_at: null, latest_post_at: null, poll_backoff_until: new Date(now + 60_000).toISOString() }, now), false);
  assertEquals(pollDue({ comments_polled_at: ago(90_000), latest_post_at: null, poll_backoff_until: ago(1) }, now), true);
  assertEquals([HOT_INTERVAL_MS, COOL_INTERVAL_MS], [30_000, 60_000]);
});

Deno.test('latestPostAt: the newest media timestamp, Instagram offsets included; null without one', () => {
  assertEquals(latestPostAt([{ timestamp: '2026-09-14T10:00:00+0000' }, { timestamp: '2026-09-15T15:00:00+0500' }, {}]), '2026-09-15T10:00:00.000Z');
  assertEquals(latestPostAt([{}]), null);
  assertEquals(latestPostAt([]), null);
});

Deno.test('recentMediaWithComments: one request for the newest posts and their first page of comments', async () => {
  const stub = stubFetch(() =>
    Response.json({
      data: [{ id: 'm1', media_product_type: 'FEED', timestamp: '2026-09-15T09:00:00+0000', comments: { data: [{ id: 'c1', text: 'hi', timestamp: '2026-09-15T09:05:00+0000' }] } }],
    })
  );
  try {
    const media = await recentMediaWithComments('tok', 5);
    assertEquals(media[0].comments?.data?.[0].id, 'c1');
    assertEquals(stub.calls.length, 1);
    const url = stub.calls[0].url;
    assertEquals([url.pathname, url.searchParams.get('limit')], ['/v23.0/me/media', '5']);
    assertEquals(
      url.searchParams.get('fields'),
      'id,media_product_type,timestamp,comments.limit(50){id,text,timestamp,hidden,from,username,replies{id,text,timestamp,hidden,from,username}}'
    );
  } finally {
    stub.restore();
  }
});

Deno.test('recentComments: a page already in hand is used first, and only older pages are fetched', async () => {
  const since = Date.UTC(2026, 8, 14, 10);
  const c = (id: string, minutes: number) => ({ id, text: id, timestamp: new Date(since + minutes * 60_000).toISOString() });
  const stub = stubFetch(() => Response.json({ data: [c('c2', 1), c('c1', -5)] }));
  try {
    // Everything on the first page is newer than the cursor and there is a next page: one fetch.
    const more = await recentComments('m1', 'tok', since, { data: [c('c4', 9), c('c3', 5)], paging: { next: 'https://graph.instagram.com/v23.0/m1/comments?after=p2' } });
    assertEquals(more.map((x) => x.id), ['c4', 'c3', 'c2', 'c1']);
    assertEquals(stub.calls.length, 1);
    // The first page already reaches past the cursor: no fetch at all.
    const done = await recentComments('m1', 'tok', since, { data: [c('c4', 9), c('c0', -1)], paging: { next: 'https://graph.instagram.com/v23.0/m1/comments?after=p2' } });
    assertEquals(done.map((x) => x.id), ['c4', 'c0']);
    assertEquals(stub.calls.length, 1);
    // No comments at all on the post.
    assertEquals(await recentComments('m1', 'tok', since, { data: [] }), []);
    assertEquals(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});

Deno.test('InstagramError.rateLimited: Meta throttle codes and 429', () => {
  assertEquals(new InstagramError(400, 'x', 4).rateLimited, true);
  assertEquals(new InstagramError(400, 'x', 17).rateLimited, true);
  assertEquals(new InstagramError(429, 'x').rateLimited, true);
  assertEquals(new InstagramError(400, 'x', 190).rateLimited, false);
});

Deno.test('recentComments: pages newest first and stops at the cursor', async () => {
  const since = Date.UTC(2026, 8, 14, 10);
  const page = (id: string, minutes: number) => ({ id, text: id, timestamp: new Date(since + minutes * 60_000).toISOString() });
  const stub = stubFetch((url) =>
    url.searchParams.get('after') === 'p2'
      ? Response.json({ data: [page('c2', 1), page('c1', -5)], paging: { next: 'https://graph.instagram.com/v23.0/m1/comments?after=p3' } })
      : Response.json({ data: [page('c4', 9), page('c3', 5)], paging: { next: 'https://graph.instagram.com/v23.0/m1/comments?after=p2' } })
  );
  try {
    const comments = await recentComments('m1', 'tok', since);
    assertEquals(comments.map((c) => c.id), ['c4', 'c3', 'c2', 'c1']);
    assertEquals(stub.calls.length, 2); // p3 is never asked for
    const first = stub.calls[0].url;
    assertEquals(first.pathname, '/v23.0/m1/comments');
    assert(first.searchParams.get('fields')?.includes('replies{id,text,timestamp,hidden,from,username}'));
  } finally {
    stub.restore();
  }
});

Deno.test('verifyHmacSha256: accepts Meta signatures, rejects anything else', async () => {
  const body = new TextEncoder().encode('{"object":"instagram","entry":[]}');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('app-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hex = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, body))].map((b) => b.toString(16).padStart(2, '0')).join('');
  assert(await verifyHmacSha256('app-secret', body.buffer, hex));
  assert(!(await verifyHmacSha256('other-secret', body.buffer, hex)));
  assert(!(await verifyHmacSha256('app-secret', new TextEncoder().encode('{}').buffer, hex)));
  assert(!(await verifyHmacSha256('app-secret', body.buffer, 'not-hex')));
  assert(!(await verifyHmacSha256('app-secret', body.buffer, '')));
});

Deno.test('seal/unseal: round-trips, and rejects tampering, expiry, other purposes and keys', async () => {
  const token = await seal('connect-state', { uid: 'u1', returnUrl: 'toxoff://x' }, 'secret', 60_000);
  assert(/^[A-Za-z0-9_-]+$/.test(token));
  const data = await unseal<{ uid: string; returnUrl: string }>('connect-state', token, 'secret');
  assertEquals([data?.uid, data?.returnUrl], ['u1', 'toxoff://x']);
  assertEquals(await unseal('connect-pending', token, 'secret'), null);
  assertEquals(await unseal('connect-state', token, 'other-secret'), null);
  const tampered = token.slice(0, -2) + (token.endsWith('A') ? 'BB' : 'AA');
  assertEquals(await unseal('connect-state', tampered, 'secret'), null);
  assertEquals(await unseal('connect-state', await seal('connect-state', {}, 'secret', -1), 'secret'), null);
  assertEquals(await unseal('connect-state', 'garbage!', 'secret'), null);
});

Deno.test('safeEqual', () => {
  assert(safeEqual('abc', 'abc'));
  assert(!safeEqual('abc', 'abd'));
  assert(!safeEqual('abc', 'abcd'));
});

Deno.test('authorizeUrl asks for comment management and carries the state', () => {
  const url = new URL(authorizeUrl('123', 'https://p.supabase.co/functions/v1/api/connect/instagram/callback', 'st'));
  assertEquals(url.origin + url.pathname, 'https://www.instagram.com/oauth/authorize');
  assertEquals(url.searchParams.get('client_id'), '123');
  assertEquals(url.searchParams.get('response_type'), 'code');
  assertEquals(url.searchParams.get('state'), 'st');
  assertEquals(url.searchParams.get('scope'), 'instagram_business_basic,instagram_business_manage_comments');
});

Deno.test('exchangeCode handles the documented and the flat response shapes', async () => {
  for (const body of [
    { data: [{ access_token: 'short', user_id: '1', permissions: 'instagram_business_basic,instagram_business_manage_comments' }] },
    { access_token: 'short', user_id: '1', permissions: ['instagram_business_basic', 'instagram_business_manage_comments'] },
  ]) {
    const stub = stubFetch(() => Response.json(body));
    try {
      const result = await exchangeCode({ appId: 'a', appSecret: 's', redirectUri: 'https://cb', code: 'c' });
      assertEquals(result, { accessToken: 'short', permissions: ['instagram_business_basic', 'instagram_business_manage_comments'] });
      const sent = new URLSearchParams(String(stub.calls[0].init?.body));
      assertEquals([sent.get('grant_type'), sent.get('code'), sent.get('redirect_uri')], ['authorization_code', 'c', 'https://cb']);
    } finally {
      stub.restore();
    }
  }
});

Deno.test('Instagram errors: expired token, deleted comment, flat OAuth errors', async () => {
  const cases: [Response, (e: InstagramError) => boolean][] = [
    [Response.json({ error: { message: 'expired', code: 190 } }, { status: 400 }), (e) => e.tokenInvalid && !e.gone],
    [Response.json({ error: { message: 'no such object', code: 100, error_subcode: 33 } }, { status: 400 }), (e) => e.gone && !e.tokenInvalid],
    [Response.json({ error_type: 'OAuthException', code: 400, error_message: 'bad code' }, { status: 400 }), (e) => e.message === 'bad code'],
    [new Response('down', { status: 502 }), (e) => e.status === 502 && !e.gone && !e.tokenInvalid],
  ];
  for (const [response, check] of cases) {
    const stub = stubFetch(() => response);
    try {
      const error = await assertRejects(() => setCommentHidden('c1', true, 'tok'), InstagramError);
      assert(check(error), error.message);
    } finally {
      stub.restore();
    }
  }
  const stub = stubFetch(() => Response.json({ success: true }));
  try {
    await setCommentHidden('c1', true, 'tok');
    const url = stub.calls[0].url;
    assertEquals([url.pathname, url.searchParams.get('hide'), stub.calls[0].init?.method], ['/v23.0/c1', 'true', 'POST']);
  } finally {
    stub.restore();
  }
});

// ---------- Stripe ----------

async function stripeSignature(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
  return { timestamp, hex: [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('') };
}

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    cancel_at: null,
    trial_end: null,
    default_payment_method: 'pm_1',
    pending_setup_intent: null,
    items: { data: [{ id: 'si_1', price: { id: 'price_1', lookup_key: 'toxoff_solo_monthly' }, current_period_end: 1_800_000_000 }] },
    ...overrides,
  };
}

Deno.test('formEncode: Stripe-style nested objects and arrays, nulls left out', () => {
  const form = formEncode({
    customer: 'cus_1',
    items: [{ price: 'price_1' }],
    payment_settings: { payment_method_types: ['card'], save_default_payment_method: 'on_subscription' },
    trial_end: undefined,
    trial_settings: null,
    cancel_at_period_end: false,
    expand: ['latest_invoice.confirmation_secret', 'pending_setup_intent'],
  });
  assertEquals([...form], [
    ['customer', 'cus_1'],
    ['items[0][price]', 'price_1'],
    ['payment_settings[payment_method_types][0]', 'card'],
    ['payment_settings[save_default_payment_method]', 'on_subscription'],
    ['cancel_at_period_end', 'false'],
    ['expand[0]', 'latest_invoice.confirmation_secret'],
    ['expand[1]', 'pending_setup_intent'],
  ]);
});

Deno.test('verifyWebhook: accepts Stripe signatures, rejects forgeries, tampering and replays', async () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', object: 'subscription', customer: 'cus_1' } } });
  const bytes = () => new TextEncoder().encode(body).buffer;
  const { timestamp, hex } = await stripeSignature('whsec_test', body);
  const event = await verifyWebhook(bytes(), `t=${timestamp},v1=${hex}`, 'whsec_test');
  assertEquals(event?.data.object.id, 'sub_1');
  // During a secret rotation Stripe sends one v1 per secret; any match will do.
  assert(await verifyWebhook(bytes(), `t=${timestamp},v1=${'0'.repeat(64)},v1=${hex}`, 'whsec_test'));
  assertEquals(await verifyWebhook(bytes(), `t=${timestamp},v1=${hex}`, 'whsec_other'), null);
  assertEquals(await verifyWebhook(new TextEncoder().encode(body.replace('sub_1', 'sub_2')).buffer, `t=${timestamp},v1=${hex}`, 'whsec_test'), null);
  assertEquals(await verifyWebhook(bytes(), `t=${timestamp + 1},v1=${hex}`, 'whsec_test'), null);
  const old = await stripeSignature('whsec_test', body, timestamp - 301);
  assertEquals(await verifyWebhook(bytes(), `t=${old.timestamp},v1=${old.hex}`, 'whsec_test'), null);
  assertEquals(await verifyWebhook(bytes(), `t=${timestamp},v0=${hex}`, 'whsec_test'), null);
  assertEquals(await verifyWebhook(bytes(), null, 'whsec_test'), null);
  assertEquals(await verifyWebhook(bytes(), 'garbage', 'whsec_test'), null);
});

Deno.test('Stripe requests: pinned version, secret key, idempotency, query for GET, errors', async () => {
  Deno.env.set('STRIPE_SECRET_KEY', 'sk_test_unit');
  const stub = stubFetch((url) =>
    url.pathname === '/v1/customers'
      ? Response.json({ id: 'cus_1' })
      : url.pathname === '/v1/prices'
        ? Response.json({ data: [{ id: 'price_1', lookup_key: 'toxoff_solo_monthly' }] })
        : Response.json({ error: { message: 'Your card was declined.', code: 'card_declined' } }, { status: 402 })
  );
  try {
    assertEquals((await createCustomer('user-1', 'a@b.co')).id, 'cus_1');
    const [customer] = stub.calls;
    const headers = new Headers(customer.init?.headers);
    assertEquals(headers.get('Stripe-Version'), '2025-03-31.basil');
    assertEquals(headers.get('Authorization'), 'Bearer sk_test_unit');
    assertEquals(headers.get('Idempotency-Key'), 'toxoff-customer-user-1');
    assertEquals(new URLSearchParams(String(customer.init?.body)).get('metadata[user_id]'), 'user-1');

    await pricesByLookupKey(['toxoff_solo_monthly']);
    assertEquals([stub.calls[1].init?.method, stub.calls[1].init?.body, stub.calls[1].url.searchParams.get('lookup_keys[0]')], ['GET', undefined, 'toxoff_solo_monthly']);

    const error = await assertRejects(() => updateSubscription('sub_1', { items: [{ id: 'si_1', price: 'price_2' }] }), StripeError);
    assertEquals([error.status, error.code, error.message], [402, 'card_declined', 'Your card was declined.']);
  } finally {
    stub.restore();
    Deno.env.delete('STRIPE_SECRET_KEY');
  }
});

Deno.test('planOfPrice reads toxoff lookup keys only', () => {
  assertEquals(planOfPrice({ id: 'p', lookup_key: lookupKey('plus', 'annual') }), { plan: 'plus', interval: 'annual' });
  assertEquals(planOfPrice({ id: 'p', lookup_key: 'toxoff_gold_monthly' }), null);
  assertEquals(planOfPrice({ id: 'p', lookup_key: null }), null);
});

Deno.test('billingState: Stripe statuses as the app sees them', () => {
  const at = (unix: number) => new Date(unix * 1000).toISOString();
  assertEquals(billingState(subscription(), false), { status: 'active', plan: 'solo', interval: 'monthly', periodEnd: at(1_800_000_000), cancelAtPeriodEnd: false });
  assertEquals(billingState(subscription({ status: 'past_due' }), false).status, 'past_due');
  // Chosen during the trial: only counts once there's a card, and the period ends with the trial.
  const trialing = subscription({ status: 'trialing', trial_end: 1_700_000_000 });
  assertEquals(billingState(trialing, true), { status: 'scheduled', plan: 'solo', interval: 'monthly', periodEnd: at(1_700_000_000), cancelAtPeriodEnd: false });
  assertEquals(billingState(trialing, false).status, 'none');
  for (const status of ['incomplete', 'incomplete_expired', 'canceled', 'unpaid', 'paused'] as const) {
    assertEquals(billingState(subscription({ status }), true).status, 'none', status);
  }
  // Cancelling: at the period end, or on a set date.
  assertEquals(billingState(subscription({ cancel_at_period_end: true, cancel_at: 1_800_000_000 }), false).cancelAtPeriodEnd, true);
  assertEquals(billingState(subscription({ cancel_at: 1_750_000_000 }), false), { status: 'active', plan: 'solo', interval: 'monthly', periodEnd: at(1_750_000_000), cancelAtPeriodEnd: true });
  // Older API versions keep the period end on the subscription itself.
  const legacy = subscription({ current_period_end: 1_790_000_000, items: { data: [{ id: 'si_1', price: { id: 'price_1', lookup_key: 'toxoff_plus_annual' } }] } });
  assertEquals(billingState(legacy, false), { status: 'active', plan: 'plus', interval: 'annual', periodEnd: at(1_790_000_000), cancelAtPeriodEnd: false });
  assertThrows(() => billingState(subscription({ items: { data: [{ id: 'si_1', price: { id: 'price_x', lookup_key: null } }] } }), false));
});

// ---------- App Store (RevenueCat) ----------

Deno.test('planOfProduct reads toxoff App Store (and Play) product ids only', () => {
  assertEquals(planOfProduct('toxoff_plus_annual'), { plan: 'plus', interval: 'annual' });
  assertEquals(planOfProduct('toxoff_studio_monthly'), { plan: 'studio', interval: 'monthly' });
  assertEquals(planOfProduct('toxoff_solo_monthly:base'), { plan: 'solo', interval: 'monthly' });
  assertEquals(planOfProduct('toxoff_gold_monthly'), null);
  assertEquals(planOfProduct('com.other.app.monthly'), null);
});

Deno.test('storeBillingState: App Store subscriptions as the app sees them', () => {
  const now = Date.UTC(2026, 8, 14);
  const at = (days: number) => new Date(now + days * 86_400_000).toISOString();
  assertEquals(storeBillingState({}, now), { status: 'none', plan: null, interval: null, periodEnd: null, cancelAtPeriodEnd: false });
  assertEquals(storeBillingState({ toxoff_solo_monthly: { expires_date: at(20) } }, now), {
    status: 'active', plan: 'solo', interval: 'monthly', periodEnd: at(20), cancelAtPeriodEnd: false,
  });
  // Turned off auto-renew in Apple's settings: still on until it ends.
  assertEquals(storeBillingState({ toxoff_plus_annual: { expires_date: at(100), unsubscribe_detected_at: at(-1) } }, now).cancelAtPeriodEnd, true);
  // Expired, refunded, or not a toxoff product: none.
  assertEquals(storeBillingState({ toxoff_solo_monthly: { expires_date: at(-1) } }, now).status, 'none');
  assertEquals(storeBillingState({ toxoff_solo_monthly: { expires_date: at(5), refunded_at: at(-1) } }, now).status, 'none');
  assertEquals(storeBillingState({ other_product: { expires_date: at(5) } }, now).status, 'none');
  // Billing problem: Apple's grace period keeps it on, as past_due.
  const grace = storeBillingState({ toxoff_plus_monthly: { expires_date: at(-1), grace_period_expires_date: at(6), billing_issues_detected_at: at(-1) } }, now);
  assertEquals([grace.status, grace.plan], ['past_due', 'plus']);
  // A billing problem after the grace period: none.
  assertEquals(storeBillingState({ toxoff_plus_monthly: { expires_date: at(-10), grace_period_expires_date: at(-4), billing_issues_detected_at: at(-12) } }, now).status, 'none');
  // Overlap while switching plans: Plus wins over Solo, then the one running longest.
  assertEquals(storeBillingState({ toxoff_solo_annual: { expires_date: at(300) }, toxoff_plus_monthly: { expires_date: at(30) } }, now).plan, 'plus');
  assertEquals(storeBillingState({ toxoff_plus_annual: { expires_date: at(300) }, toxoff_studio_monthly: { expires_date: at(30) } }, now).plan, 'studio');
  assertEquals(storeBillingState({ toxoff_solo_monthly: { expires_date: at(3) }, toxoff_solo_annual: { expires_date: at(300) } }, now).interval, 'annual');
});

Deno.test('eventUsers: toxoff user ids from every id field, anonymous ids skipped', () => {
  const a = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
  const b = '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
  assertEquals(eventUsers({ app_user_id: a, original_app_user_id: '$RCAnonymousID:abc', aliases: [a, '$RCAnonymousID:abc'] }), [a]);
  assertEquals(eventUsers({ type: 'TRANSFER', transferred_from: [a], transferred_to: [b] }), [a, b]);
  assertEquals(eventUsers({ type: 'TEST', app_user_id: 'test_user' }), []);
});

Deno.test('fetchWithRetry: reads are tried once more on a gateway error, writes never', async () => {
  const { fetchWithRetry } = await import('../api/db.ts');
  let status = 504;
  const stub = stubFetch(() => new Response('', { status: status === 504 ? (status = 200, 504) : 200 }));
  try {
    assertEquals((await fetchWithRetry('https://p.supabase.co/rest/v1/x')).status, 200);
    assertEquals(stub.calls.length, 2);
    status = 504;
    assertEquals((await fetchWithRetry('https://p.supabase.co/rest/v1/rpc/claim_comment', { method: 'POST' })).status, 504);
    assertEquals(stub.calls.length, 3);
  } finally {
    stub.restore();
  }
});

Deno.test("deleteComment: DELETE on the comment, errors like hiding", async () => {
  const stub = stubFetch(() => Response.json({ success: true }));
  try {
    await deleteComment("c9", "tok");
    const { url, init } = stub.calls[0];
    assertEquals([url.pathname, url.searchParams.get("access_token"), init?.method], ["/v23.0/c9", "tok", "DELETE"]);
  } finally {
    stub.restore();
  }
  const gone = stubFetch(() => Response.json({ error: { message: "no such object", code: 100, error_subcode: 33 } }, { status: 400 }));
  try {
    const error = await assertRejects(() => deleteComment("c9", "tok"), InstagramError);
    assert(error.gone);
  } finally {
    gone.restore();
  }
});

Deno.test('eraseSelection: all deleted comments by default, else a list of ids; erased rows keep no words', () => {
  const id = '0b8d1e6e-4c1b-4f5a-9d3e-2a7c6b1f0e11';
  assertEquals(eraseSelection({}), null);
  assertEquals(eraseSelection({ commentIds: [id] }), [id]);
  assertEquals(assertThrows(() => eraseSelection({ commentIds: [] }), HttpError).status, 400);
  assertEquals(assertThrows(() => eraseSelection({ commentIds: 'all' }), HttpError).status, 400);
  assertEquals(assertThrows(() => eraseSelection({ commentIds: [id, 'not-a-uuid'] }), HttpError).status, 404);
  assertEquals(assertThrows(() => eraseSelection({ commentIds: Array(501).fill(id) }), HttpError).status, 400);
  assertEquals(ERASED, { text: '', username: '', language: null, post_ref: null });
});

Deno.test('requireConfirmation: account deletion needs an explicit confirm: true', () => {
  requireConfirmation({ confirm: true });
  assertEquals(assertThrows(() => requireConfirmation({}), HttpError).status, 400);
  assertEquals(assertThrows(() => requireConfirmation({ confirm: 'yes' }), HttpError).status, 400);
  assertEquals(assertThrows(() => requireConfirmation({ confirm: 1 }), HttpError).status, 400);
});

Deno.test('summaryMessage: counts read naturally and open the Log', () => {
  assertEquals(summaryMessage(1).body, '1 toxic comment was removed in the last 24 hours. You didn’t have to see it.');
  assertEquals(summaryMessage(12).body, '12 toxic comments were removed in the last 24 hours. You didn’t have to see them.');
  assertEquals(summaryMessage(3).data, { screen: 'log' });
});

Deno.test('chooseAction: auto deletes AI-scored toxicity at 80%+ (never spam), hide/delete apply to all', () => {
  const ai = (reason: 'harassment' | 'hate_speech' | 'slurs' | 'toxicity' | 'spam', confidence: number) =>
    ({ remove: true, reason, confidence }) as const;
  assertEquals(AUTO_DELETE_THRESHOLD, 0.8);
  assertEquals(chooseAction(ai('harassment', 0.8), 'auto'), 'delete');
  assertEquals(chooseAction(ai('harassment', 0.98), 'auto'), 'delete');
  assertEquals(chooseAction(ai('harassment', 0.79), 'auto'), 'hide');
  assertEquals(chooseAction(ai('hate_speech', 0.99), 'auto'), 'delete');
  assertEquals(chooseAction(ai('slurs', 0.9), 'auto'), 'delete');
  assertEquals(chooseAction(ai('toxicity', 0.8), 'auto'), 'delete');
  assertEquals(chooseAction(ai('toxicity', 0.7), 'auto'), 'hide');
  assertEquals(chooseAction(ai('spam', 0.99), 'auto'), 'hide'); // a wrong spam call must stay reversible
  // A blocked user scores harassment at 100% by rule, not by the AI: hidden in auto mode.
  assertEquals(chooseAction({ remove: true, reason: 'harassment', confidence: 1, byRule: true }, 'auto'), 'hide');
  assertEquals(chooseAction(ai('harassment', 0.99), 'hide'), 'hide');
  assertEquals(chooseAction(ai('spam', 0.6), 'delete'), 'delete');
});
