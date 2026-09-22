// Run: node --test scripts/web-crypto.test.cjs
// The WebCrypto shim that lets supabase-js use SHA-256 PKCE on the phone (src/lib/webCrypto.ts).
const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/webCrypto.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const helper = { exports: {} };
new Function('module', 'exports', compiled)(helper, helper.exports);
const { installWebCrypto } = helper.exports;

const expo = {
  getRandomValues: (array) => nodeCrypto.webcrypto.getRandomValues(array),
  digest: (algorithm, data) => nodeCrypto.webcrypto.subtle.digest(algorithm, data),
};

test('installs getRandomValues and subtle.digest where the runtime has no crypto at all', async () => {
  const target = {};
  installWebCrypto(target, expo);
  const bytes = target.crypto.getRandomValues(new Uint8Array(32));
  assert.equal(bytes.length, 32);
  assert.ok(bytes.some((b) => b !== 0));
  const hash = Buffer.from(await target.crypto.subtle.digest('SHA-256', new TextEncoder().encode('abc'))).toString('hex');
  assert.equal(hash, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await assert.rejects(target.crypto.subtle.digest('MD5', new Uint8Array(1)), /Unsupported/);
});

test('leaves an existing implementation alone', async () => {
  const marker = { getRandomValues: (a) => a, subtle: { digest: async () => new ArrayBuffer(1) } };
  const target = { crypto: marker };
  installWebCrypto(target, expo);
  assert.equal(target.crypto, marker);
  assert.equal(target.crypto.getRandomValues, marker.getRandomValues);
  assert.equal(target.crypto.subtle.digest, marker.subtle.digest);
});

test('supabase-js picks the s256 challenge once the shim is installed', async () => {
  const previous = globalThis.crypto;
  const helpers = require('@supabase/auth-js/dist/main/lib/helpers.js');
  const [challenge, method] = await helpers.getCodeChallengeAndMethod({ getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }, 'k');
  assert.equal(method, 's256'); // Node has WebCrypto; the shim keeps it
  assert.equal(challenge.length, 43);
  assert.equal(globalThis.crypto, previous);
});
