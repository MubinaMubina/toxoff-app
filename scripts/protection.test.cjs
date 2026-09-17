// Run with: node --test scripts/protection.test.cjs
// Compile the pure summary helper without React Native, cached account state, or a network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/protection.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const helper = { exports: {} };
new Function('module', 'exports', compiled)(helper, helper.exports);
const { getProtectionSummary } = helper.exports;

const account = (id, overrides = {}) => ({
  id, handle: `creator${id}`, platform: 'instagram', connected: true, paused: false, ...overrides,
});
const summary = (overrides = {}) => getProtectionSummary({
  accounts: [account('1')], maxAccounts: 5, outOfFreeChecks: false, status: 'ready', ...overrides,
});

test('loading and offline never promote stale healthy accounts to confirmed protection', () => {
  for (const status of ['loading', 'offline']) {
    for (const accounts of [[], [account('cached')]]) {
      const result = summary({ status, accounts, outOfFreeChecks: true });
      assert.equal(result.kind, status);
      assert.equal(result.activeCount, 0);
      assert.equal(result.tone, 'warning');
      assert.equal(result.action, status === 'offline' ? 'retry' : null);
      assert.doesNotMatch(result.title, /is protected|are protected/);
    }
  }
});

test('no Instagram account offers connection rather than claiming protection', () => {
  for (const accounts of [[], [account('tiktok', { platform: 'tiktok' })]]) {
    const result = summary({ accounts });
    assert.equal(result.kind, 'unconnected');
    assert.equal(result.activeCount, 0);
    assert.equal(result.action, 'connect');
    assert.equal(result.tone, 'info');
  }
});

test('an expired Instagram connection requires reconnecting instead of new-account setup', () => {
  const result = summary({ accounts: [account('1', { connected: false })] });
  assert.equal(result.kind, 'attention');
  assert.equal(result.activeCount, 0);
  assert.equal(result.action, 'manage');
  assert.match(result.title, /Reconnect/);
  assert.match(result.description, /needs reconnecting/);
});

test('exhausted free checks overrides healthy, paused, and expired account statuses', () => {
  for (const overrides of [{}, { paused: true }, { connected: false }]) {
    const result = summary({ accounts: [account('1', overrides)], outOfFreeChecks: true });
    assert.equal(result.kind, 'quota');
    assert.equal(result.activeCount, 0);
    assert.equal(result.action, 'upgrade');
    assert.equal(result.tone, 'warning');
  }
});

test('fully paused coverage offers resume without claiming any active account', () => {
  const result = summary({ accounts: [account('1', { paused: true }), account('2', { paused: true })] });
  assert.equal(result.kind, 'paused');
  assert.equal(result.activeCount, 0);
  assert.equal(result.action, 'manage');
  assert.match(result.description, /Resume/);
});

test('partial coverage counts only healthy accounts and describes both paused and expired accounts', () => {
  const result = summary({ accounts: [
    account('1'), account('2', { paused: true }), account('3', { connected: false, paused: true }),
  ] });
  assert.equal(result.kind, 'attention');
  assert.equal(result.activeCount, 1);
  assert.equal(result.action, 'manage');
  assert.equal(result.title, '1 of 3 accounts protected');
  assert.match(result.description, /1 account needs reconnecting/);
  assert.match(result.description, /1 account is paused/);
});

test('paused and disconnected accounts together require attention even when none is active', () => {
  const result = summary({ accounts: [account('1', { paused: true }), account('2', { connected: false })] });
  assert.equal(result.kind, 'attention');
  assert.equal(result.activeCount, 0);
  assert.match(result.description, /paused/);
  assert.match(result.description, /reconnecting/);
});

test('a downgrade limits active coverage to the original ordered plan slots', () => {
  const result = summary({ accounts: [account('1'), account('2'), account('3')], maxAccounts: 1 });
  assert.equal(result.kind, 'attention');
  assert.equal(result.activeCount, 1);
  assert.equal(result.action, 'manage');
  assert.match(result.description, /2 accounts are outside your plan limit/);

  for (const first of [{ paused: true }, { connected: false }]) {
    const blockedSlot = summary({ accounts: [account('1', first), account('2')], maxAccounts: 1 });
    assert.equal(blockedSlot.activeCount, 0);
    assert.equal(blockedSlot.kind, 'attention');
  }
});

test('zero, negative, or invalid plan limits cannot imply protection', () => {
  for (const maxAccounts of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = summary({ maxAccounts });
    assert.equal(result.kind, 'attention');
    assert.equal(result.activeCount, 0);
    assert.match(result.description, /outside your plan limit/);
  }
});

test('legacy TikTok entries never count as protected or shift an Instagram account into a paid slot', () => {
  const accounts = [account('tiktok', { platform: 'tiktok' }), account('instagram')];
  const partial = summary({ accounts, maxAccounts: 2 });
  assert.equal(partial.kind, 'attention');
  assert.equal(partial.activeCount, 1);
  assert.match(partial.description, /TikTok moderation is not available/);
  assert.equal(summary({ accounts, maxAccounts: 1 }).activeCount, 0);
});

test('verified healthy Instagram accounts have singular and plural protection copy', () => {
  const single = summary();
  assert.equal(single.kind, 'active');
  assert.equal(single.activeCount, 1);
  assert.equal(single.title, 'Your Instagram is protected');
  assert.equal(single.action, null);
  assert.equal(single.tone, 'success');
  const multiple = summary({ accounts: [account('1'), account('2')], maxAccounts: 2 });
  assert.equal(multiple.kind, 'active');
  assert.equal(multiple.activeCount, 2);
  assert.equal(multiple.tone, 'success');
  assert.equal(multiple.title, 'Your Instagram accounts are protected');
});

test('summary calculation never mutates account order or state', () => {
  const accounts = Object.freeze([Object.freeze(account('1', { paused: true })), Object.freeze(account('2'))]);
  const before = JSON.stringify(accounts);
  summary({ accounts, maxAccounts: 1 });
  assert.equal(JSON.stringify(accounts), before);
});
