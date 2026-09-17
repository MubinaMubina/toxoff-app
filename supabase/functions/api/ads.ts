import { db } from './db.ts';
import { json, text } from './http.ts';

// Rewarded ads (app: src/lib/ads.ts). When a Free user finishes watching one, Google's servers
// call GET /webhooks/admob-ssv ("server-side verification"), signed with one of Google's keys.
// Only that call adds the reward (grant_ad_reward in supabase/migrations); the app itself is never
// trusted to say an ad was watched. https://developers.google.com/admob/android/ssv
//
// The callback's query string is alphabetical, with `signature` and `key_id` appended last, in
// that order. The signature (ECDSA P-256 over SHA-256, DER, base64) covers everything before
// `&signature=`, byte for byte, so the query string is used as received, never rebuilt.

export const VERIFIER_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const KEYS_TTL_MS = 6 * 60 * 60_000; // Google rotates the keys and says not to cache them for a day
const KEYS_MIN_REFRESH_MS = 60_000; // an unknown key id refreshes them, but not on every request
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VerifierKey = { keyId: number | string; base64: string };

let cached: { keys: VerifierKey[]; at: number } | null = null;

async function verifierKeys(force = false): Promise<VerifierKey[]> {
  const age = cached ? Date.now() - cached.at : Infinity;
  if (cached && age < (force ? KEYS_MIN_REFRESH_MS : KEYS_TTL_MS)) return cached.keys;
  const res = await fetch(VERIFIER_KEYS_URL);
  if (!res.ok) throw new Error(`AdMob key server returned ${res.status}`);
  const body = await res.json();
  cached = { keys: Array.isArray(body?.keys) ? body.keys : [], at: Date.now() };
  return cached.keys;
}

/** The signed content (the query string before `&signature=`), the signature and the key id. */
export function signedParts(url: URL): { content: string; signature: string; keyId: string } | null {
  const query = url.search.replace(/^\?/, '');
  const at = query.indexOf('&signature=');
  if (at < 0) return null;
  const tail = new URLSearchParams(query.slice(at + 1));
  const signature = tail.get('signature');
  const keyId = tail.get('key_id');
  if (!signature || !keyId) return null;
  return { content: query.slice(0, at), signature, keyId };
}

// Google's signature is base64url; its keys file is standard base64. Both decode here.
function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  const standard = base64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A DER ECDSA signature (SEQUENCE of two INTEGERs) as the 64 bytes r‖s that WebCrypto verifies. */
export function rawSignature(der: Uint8Array): Uint8Array<ArrayBuffer> | null {
  let i = 0;
  const length = () => {
    let n = der[i++];
    if (n === undefined) return -1;
    if (n & 0x80) {
      const count = n & 0x7f;
      n = 0;
      for (let k = 0; k < count; k++) n = (n << 8) | der[i++];
    }
    return n;
  };
  if (der[i++] !== 0x30 || length() < 0) return null;
  const raw = new Uint8Array(new ArrayBuffer(64));
  for (let part = 0; part < 2; part++) {
    if (der[i++] !== 0x02) return null;
    const n = length();
    if (n < 1 || i + n > der.length) return null;
    let start = i;
    while (start < i + n - 1 && der[start] === 0) start++; // the sign byte DER adds for high values
    const value = der.subarray(start, i + n);
    if (value.length > 32) return null;
    raw.set(value, part * 32 + 32 - value.length);
    i += n;
  }
  return i === der.length ? raw : null;
}

export async function verifySignature(content: string, signature: string, key: VerifierKey): Promise<boolean> {
  let raw: Uint8Array<ArrayBuffer> | null;
  let publicKey: CryptoKey;
  try {
    raw = rawSignature(bytesOf(signature));
    if (!raw) return false;
    publicKey = await crypto.subtle.importKey(
      'spki', bytesOf(key.base64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
    );
  } catch {
    return false;
  }
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, raw, new TextEncoder().encode(content));
}

export type VerifiedReward = { uid: string; transactionId: string; adUnit: string | null };

/**
 * The reward a callback stands for, if it was signed by one of the given keys. The app sends the
 * toxoff user id as the ad's user id (or custom data); the transaction id is unique per reward.
 */
export async function verifiedReward(url: URL, keys: VerifierKey[]): Promise<VerifiedReward | null> {
  const parts = signedParts(url);
  if (!parts) return null;
  const key = keys.find((k) => String(k.keyId) === parts.keyId);
  if (!key || !(await verifySignature(parts.content, parts.signature, key))) return null;
  const params = url.searchParams;
  const uid = [params.get('user_id'), params.get('custom_data')].find((v) => v && UUID.test(v)) ?? null;
  const transactionId = params.get('transaction_id');
  if (!uid || !transactionId) return null;
  return { uid: uid.toLowerCase(), transactionId, adUnit: params.get('ad_unit') };
}

// Google expects HTTP 200 for every callback it can deliver (it also sends one when the URL is
// saved in AdMob, to check it answers). Whether a reward is granted is decided here and reported
// in the body, never with the status: a bad signature or a callback naming no toxoff user is
// acknowledged and logged, not retried.
export async function receiveAdMobReward(url: URL): Promise<Response> {
  const parts = signedParts(url);
  if (!parts) return text('Bad request', 400);
  let keys = await verifierKeys();
  if (!keys.some((k) => String(k.keyId) === parts.keyId)) keys = await verifierKeys(true);
  const key = keys.find((k) => String(k.keyId) === parts.keyId);
  const signed = key ? await verifySignature(parts.content, parts.signature, key) : false;
  if (!signed) {
    console.warn(`AdMob callback refused: ${key ? 'bad signature' : `unknown key id ${parts.keyId}`}`);
    return json({ result: 'invalid_signature' });
  }
  const reward = await verifiedReward(url, keys);
  if (!reward) {
    console.log('AdMob callback verified, no toxoff user or transaction in it (AdMob\'s URL check?)');
    return json({ result: 'no_user' });
  }

  const { data, error } = await db().rpc('grant_ad_reward', {
    uid: reward.uid,
    p_transaction_id: reward.transactionId,
    p_ad_unit: reward.adUnit,
  });
  if (error) throw error; // a 500 makes Google send the callback again
  console.log(`Ad reward ${reward.transactionId}: ${data}`);
  return json({ result: data });
}
