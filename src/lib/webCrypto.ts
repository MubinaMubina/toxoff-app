/**
 * The minimum of WebCrypto that supabase-js needs for PKCE sign-in: crypto.getRandomValues (a
 * random code verifier) and crypto.subtle.digest('SHA-256') (the s256 challenge). Hermes has neither,
 * and without them supabase-js falls back to Math.random and the "plain" challenge method, which
 * sends the verifier itself in the sign-in URL. Backed by expo-crypto's native implementation.
 * Anything already present on the global is left as it is.
 */
type ExpoCrypto = {
  // expo-crypto types this for integer typed arrays; supabase-js passes a Uint32Array.
  getRandomValues: (array: any) => any;
  // expo-crypto's CryptoDigestAlgorithm enum has the standard names as its values.
  digest: (algorithm: any, data: BufferSource) => Promise<ArrayBuffer>;
};

const DIGESTS = new Set(['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']);

export function installWebCrypto(target: Record<string, any>, expo: ExpoCrypto): void {
  const existing = target.crypto ?? {};
  const getRandomValues = typeof existing.getRandomValues === 'function'
    ? existing.getRandomValues.bind(existing)
    : <T extends ArrayBufferView>(array: T) => expo.getRandomValues(array);
  const digest = typeof existing.subtle?.digest === 'function'
    ? existing.subtle.digest.bind(existing.subtle)
    : (algorithm: string | { name: string }, data: BufferSource) => {
        const name = (typeof algorithm === 'string' ? algorithm : algorithm.name).toUpperCase();
        if (!DIGESTS.has(name)) return Promise.reject(new Error(`Unsupported digest ${name}`));
        return expo.digest(name, data);
      };
  const subtle = existing.subtle ?? {};
  if (typeof subtle.digest !== 'function') subtle.digest = digest;
  if (typeof existing.getRandomValues !== 'function') existing.getRandomValues = getRandomValues;
  if (!existing.subtle) existing.subtle = subtle;
  if (!target.crypto) target.crypto = existing;
}
