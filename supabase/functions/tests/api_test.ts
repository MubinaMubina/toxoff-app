// Unit tests for the api function's pure parts. Run:
//   deno test --config supabase/functions/api/deno.json supabase/functions/tests
import { assert, assertEquals, assertRejects } from '@std/assert';
import { ClassifierError, classify, spamScore } from '../api/classifier.ts';
import { safeEqual, seal, unseal, verifyHmacSha256 } from '../api/crypto.ts';
import {
  authorizeUrl,
  commentEvents,
  exchangeCode,
  InstagramError,
  setCommentHidden,
} from '../api/instagram.ts';
import { containsTerm, decide, type FilterSettings } from '../api/moderation.ts';

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
  assertEquals(decide('hi', 'troll99', {}, f), { remove: true, reason: 'harassment', confidence: 1 });
  assertEquals(decide('total SCAM!', 'fan', {}, f), { remove: true, reason: 'slurs', confidence: 1 });
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

Deno.test('classify: maps OpenAI categories to toxoff reasons and adds spam', async () => {
  const stub = stubFetch(() =>
    Response.json({
      results: [{
        category_scores: {
          'harassment': 0.4,
          'harassment/threatening': 0.8,
          'sexual': 0.9,
          'hate': 0.1,
          'violence': 0.99,
          'illicit': 0.9,
          'self-harm/intent': 0.7,
          'sexual/minors': 0.02,
        },
      }],
    })
  );
  try {
    const scores = await classify('DM me for promo www.x.shop', 'sk-test');
    assertEquals(scores.harassment, 0.9); // max of harassment, threatening and sexual
    assertEquals(scores.hate_speech, 0.1);
    assertEquals(scores.self_harm, 0.7);
    assertEquals(scores.toxicity, 0.02);
    assert((scores.spam ?? 0) >= 0.6);
    const call = stub.calls[0];
    assertEquals(call.url.href, 'https://api.openai.com/v1/moderations');
    assertEquals(new Headers(call.init?.headers).get('Authorization'), 'Bearer sk-test');
    assertEquals(JSON.parse(String(call.init?.body)).model, 'omni-moderation-latest');
  } finally {
    stub.restore();
  }
});

Deno.test('classify: OpenAI errors are thrown so the webhook is retried', async () => {
  const stub = stubFetch(() => new Response('overloaded', { status: 503 }));
  try {
    await assertRejects(() => classify('hi', 'sk-test'), ClassifierError);
  } finally {
    stub.restore();
  }
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
