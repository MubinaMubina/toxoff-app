const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function sealingKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/**
 * Encrypts and authenticates `data` into a URL-safe token that expires after `ttlMs`.
 * `purpose` stops a token made for one step being accepted by another.
 */
export async function seal(
  purpose: string,
  data: Record<string, unknown>,
  secret: string,
  ttlMs: number
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = encoder.encode(JSON.stringify({ ...data, purpose, exp: Date.now() + ttlMs }));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealingKey(secret), plain);
  const out = new Uint8Array(iv.length + sealed.byteLength);
  out.set(iv);
  out.set(new Uint8Array(sealed), iv.length);
  return toBase64Url(out);
}

/** Returns the sealed data, or null if the token is forged, altered, expired or for another purpose. */
export async function unseal<T>(purpose: string, token: string, secret: string): Promise<T | null> {
  try {
    const bytes = fromBase64Url(token);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      await sealingKey(secret),
      bytes.slice(12)
    );
    const data = JSON.parse(new TextDecoder().decode(plain));
    if (data.purpose !== purpose || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return data as T;
  } catch {
    return null;
  }
}

/** Checks a hex HMAC-SHA256 signature of `body` (Meta's X-Hub-Signature-256). */
export async function verifyHmacSha256(
  secret: string,
  body: ArrayBuffer,
  signatureHex: string
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(signatureHex)) return false;
  const signature = Uint8Array.from(signatureHex.match(/../g)!, (h) => parseInt(h, 16));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify('HMAC', key, signature, body);
}

/** Constant-time string comparison for shared secrets. */
export function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
