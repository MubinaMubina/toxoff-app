// Run with: node --test scripts/password-recovery.test.cjs
// Compile only this pure helper; no React Native runtime, network, emails, or real credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/passwordRecovery.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const helper = { exports: {} };
new Function('module', 'exports', compiled)(helper, helper.exports);
const { parseRecoveryCallback, isVerifiedRecoverySession, passwordResetError } = helper.exports;

test('accepts a PKCE code only on the dedicated app callback', () => {
  assert.deepEqual(parseRecoveryCallback('toxoff://reset-password?code=one-time-code'), { kind: 'code', code: 'one-time-code' });
  assert.deepEqual(parseRecoveryCallback('toxoff:///reset-password?code=one-time-code'), { kind: 'code', code: 'one-time-code' });
  for (const url of ['https://reset-password?code=x', 'toxoff://connect-accounts?code=x', 'toxoff://?code=x', 'invalid']) {
    assert.deepEqual(parseRecoveryCallback(url), { kind: 'ignore' });
  }
});

test('rejects missing, ambiguous, implicit, and expired recovery credentials', () => {
  for (const suffix of ['', '?type=recovery', '?code=', '?code=a&code=b', '?code=a%20b', '?code=a#code=b', '#access_token=x&refresh_token=y&type=recovery', '?code=a&token_hash=x', '?code=a#error_code=otp_expired', '?error=access_denied']) {
    assert.deepEqual(parseRecoveryCallback(`toxoff://reset-password${suffix}`), { kind: 'invalid' }, suffix);
  }
});

test('a valid session or URL type alone cannot authorize recovery', () => {
  const now = 1000;
  const session = { access_token: 'test-token', expires_at: 10, user: { id: 'user-1' } };
  assert.equal(isVerifiedRecoverySession(null, session, 'user-1', now), false);
  assert.equal(isVerifiedRecoverySession(session, session, 'user-1', now), true);
  assert.equal(isVerifiedRecoverySession(session, { ...session, access_token: 'different-token' }, 'user-1', now), false);
  assert.equal(isVerifiedRecoverySession(session, session, 'other-user', now), false);
  assert.equal(isVerifiedRecoverySession(session, session, null, now), false);
  assert.equal(isVerifiedRecoverySession(session, session, 'user-1', 10_000), false);
  assert.equal(isVerifiedRecoverySession(session, { ...session, expires_at: undefined }, 'user-1', now), false);
});

test('auth errors do not surface server messages or credentials', () => {
  const message = passwordResetError({ message: 'secret-token-in-provider-error' }, 'request');
  assert.ok(!message.includes('secret-token'));
  assert.match(passwordResetError({ code: 'over_email_send_rate_limit' }, 'request'), /wait a minute/);
  assert.match(passwordResetError({ code: 'same_password' }, 'update'), /not used/);
});
