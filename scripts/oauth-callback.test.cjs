// Run with: node --test scripts/oauth-callback.test.cjs
// The pure helper that reads Google sign-in's one-time code from the return link.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/oauthCallback.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const helper = { exports: {} };
new Function('module', 'exports', compiled)(helper, helper.exports);
const { oauthCodeFromUrl } = helper.exports;

const CODE = '5d6dc4e0-1b2c-4d3e-8f90-16ac26b7a165';

test('the app-scheme link from iOS: the trailing # arrives encoded inside the code', () => {
  // Seen on 19 September 2026 in the first development build: redeeming "<uuid>#" failed with
  // "invalid flow state, no valid flow state found".
  assert.equal(oauthCodeFromUrl(`toxoff:?code=${CODE}%23`), CODE);
  assert.equal(oauthCodeFromUrl(`toxoff://?code=${CODE}%23`), CODE);
});

test('links where the # stays a fragment, as in Expo Go', () => {
  assert.equal(oauthCodeFromUrl(`exp://127.0.0.1:8081?code=${CODE}#`), CODE);
  assert.equal(oauthCodeFromUrl(`toxoff://?code=${CODE}#`), CODE);
  assert.equal(oauthCodeFromUrl(`toxoff://?code=${CODE}`), CODE);
});

test('the code is found among other parameters, and nothing else is mistaken for it', () => {
  assert.equal(oauthCodeFromUrl(`toxoff://?state=abc&code=${CODE}&x=1`), CODE);
  assert.equal(oauthCodeFromUrl(`toxoff://?xcode=nope&code=${CODE}`), CODE);
  assert.equal(oauthCodeFromUrl(`toxoff://?error=access_denied#code=${CODE}`), null);
});

test('links without a usable code', () => {
  for (const url of ['toxoff://', 'toxoff://?', 'toxoff://?code=', 'toxoff://?code=%23', 'toxoff://?code=%E0%A4%A', 'not a link']) {
    assert.equal(oauthCodeFromUrl(url), null, url);
  }
});
