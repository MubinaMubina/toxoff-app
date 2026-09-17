// AdMob server-side verification (supabase/functions/api/ads.ts). Run with the other tests:
//   deno test --allow-env --config supabase/functions/api/deno.json supabase/functions/tests
import { assertEquals } from '@std/assert';
import { rawSignature, signedParts, verifiedReward, verifySignature, type VerifierKey } from '../api/ads.ts';

const USER = '11111111-2222-4333-8444-555555555555';
const CONTENT =
  `ad_network=5450213213286189855&ad_unit=ca-app-pub-1/2&custom_data=n1&reward_amount=5&reward_item=checks` +
  `&timestamp=1758000000000&transaction_id=abc123def&user_id=${USER}`;

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

// DER as Google sends it: SEQUENCE { INTEGER r, INTEGER s }, a 0x00 prefixed to high values.
function derInteger(bytes: Uint8Array): number[] {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start++;
  const value = [...bytes.subarray(start)];
  if (value[0] & 0x80) value.unshift(0);
  return [0x02, value.length, ...value];
}
const der = (raw: Uint8Array) => {
  const r = derInteger(raw.subarray(0, 32));
  const s = derInteger(raw.subarray(32));
  return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
};

async function signer() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  const key: VerifierKey = { keyId: 3335741209, base64: base64(spki) };
  const sign = async (content: string) => {
    const raw = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(content))
    );
    return base64url(der(raw));
  };
  const url = async (content: string, keyId = key.keyId) =>
    new URL(`https://x.supabase.co/functions/v1/api/webhooks/admob-ssv?${content}&signature=${await sign(content)}&key_id=${keyId}`);
  return { key, sign, url };
}

Deno.test('signedParts: the content is everything before &signature=, as received', () => {
  const url = new URL(`https://x/api/webhooks/admob-ssv?${CONTENT}&signature=MEUCIQ_x-y&key_id=42`);
  assertEquals(signedParts(url), { content: CONTENT, signature: 'MEUCIQ_x-y', keyId: '42' });
  assertEquals(signedParts(new URL(`https://x/api/webhooks/admob-ssv?${CONTENT}`)), null);
  assertEquals(signedParts(new URL(`https://x/api/webhooks/admob-ssv?${CONTENT}&signature=abc`)), null);
});

Deno.test('rawSignature: DER integers of any length land right-aligned in 32 bytes', () => {
  const r = new Uint8Array(32).fill(0xab);
  const s = new Uint8Array(32);
  s[31] = 7; // a small s: DER encodes it as one byte
  const raw = rawSignature(der(new Uint8Array([...r, ...s])))!;
  assertEquals([...raw.subarray(0, 32)], [...r]);
  assertEquals([...raw.subarray(32)], [...s]);
  assertEquals(rawSignature(new Uint8Array([0x30, 0x02, 0x02, 0x00])), null);
  assertEquals(rawSignature(new Uint8Array([0x31, 0x00])), null);
  assertEquals(rawSignature(der(new Uint8Array([...r, ...s])).subarray(0, 10)), null);
});

Deno.test('verifiedReward: a callback signed by a known key names the user and the reward', async () => {
  const { key, url } = await signer();
  assertEquals(await verifiedReward(await url(CONTENT), [key]), {
    uid: USER,
    transactionId: 'abc123def',
    adUnit: 'ca-app-pub-1/2',
  });
});

Deno.test('verifiedReward: tampered content, another key, or an unknown key id is refused', async () => {
  const { key, sign, url } = await signer();
  const other = (await signer()).key;
  const signature = await sign(CONTENT);
  const forged = CONTENT.replace('reward_amount=5', 'reward_amount=500');
  assertEquals(await verifiedReward(new URL(`https://x/api?${forged}&signature=${signature}&key_id=${key.keyId}`), [key]), null);
  assertEquals(await verifiedReward(await url(CONTENT), [other]), null);
  assertEquals(await verifiedReward(await url(CONTENT, 1), [key]), null);
  assertEquals(await verifiedReward(new URL(`https://x/api?${CONTENT}&signature=%%%&key_id=${key.keyId}`), [key]), null);
  assertEquals(await verifySignature(CONTENT, signature, { keyId: 1, base64: 'not a key' }), false);
});

Deno.test('verifiedReward: the user must be a toxoff user id, from user_id or custom_data', async () => {
  const { key, url } = await signer();
  const noUser = CONTENT.replace(`&user_id=${USER}`, '').replace('custom_data=n1', 'custom_data=n1');
  assertEquals(await verifiedReward(await url(noUser), [key]), null);
  const inCustomData = CONTENT.replace(`&user_id=${USER}`, '').replace('custom_data=n1', `custom_data=${USER}`);
  assertEquals((await verifiedReward(await url(inCustomData), [key]))?.uid, USER);
  const noTransaction = CONTENT.replace('&transaction_id=abc123def', '');
  assertEquals(await verifiedReward(await url(noTransaction), [key]), null);
});
