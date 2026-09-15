// Run with: node --test scripts/auth-recovery.test.cjs
// Exercise AuthContext itself with controlled hook scheduling and mocked native/auth boundaries.
// No Supabase client, network requests, emails, or real credentials are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function compile(relativePath) {
  return ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
}
const helper = { exports: {} };
new Function('module', 'exports', compile('src/lib/passwordRecovery.ts'))(helper, helper.exports);
const providerCode = compile('src/context/AuthContext.tsx');
const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup({ initialUrl = null, marker = null, holdMarker = false, exchangeEvent = 'PASSWORD_RECOVERY' } = {}) {
  const hooks = [];
  let cursor = 0;
  let effects = [];
  let listener;
  let releaseMarker;
  let userError = null;
  let sessionError = null;
  const calls = { profiles: 0, updates: 0, purchaserIds: [] };
  const session = {
    access_token: 'fixture-recovery-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'fixture-user', email: 'creator@example.test', user_metadata: {} },
  };
  const changed = (previous, next) => !previous || previous.length !== next.length || next.some((value, i) => !Object.is(value, previous[i]));
  const memo = (factory, deps) => {
    const index = cursor++;
    if (!hooks[index] || changed(hooks[index].deps, deps)) hooks[index] = { deps, value: factory() };
    return hooks[index].value;
  };
  const React = {
    createContext: () => ({ Provider: 'Provider' }),
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useContext: () => {},
    useCallback: (callback, deps) => memo(() => callback, deps),
    useMemo: memo,
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], (next) => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!hooks[index] || changed(hooks[index].deps, deps)) {
        const previousCleanup = hooks[index]?.cleanup;
        hooks[index] = { deps };
        effects.push(() => { previousCleanup?.(); hooks[index].cleanup = callback(); });
      }
    },
  };
  const storage = {
    getItem: () => holdMarker ? new Promise((resolve) => { releaseMarker = resolve; }) : Promise.resolve(marker),
    setItem: async () => {},
    removeItem: async () => {},
  };
  const channel = { on: () => channel, subscribe: () => channel };
  const query = { select: () => query, eq: () => query, single: async () => ({ data: { billing_status: 'none', plan: 'free', trial_ends_at: null, sub_status: 'none', onboarded_at: '2026-01-01' }, error: null }) };
  const supabase = {
    auth: {
      onAuthStateChange: (callback) => { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      exchangeCodeForSession: async () => { listener(exchangeEvent, session); return { data: { session }, error: null }; },
      getUser: async () => userError ? { data: { user: null }, error: userError } : { data: { user: session.user }, error: null },
      getSession: async () => sessionError ? { data: { session: null }, error: sessionError } : { data: { session }, error: null },
      updateUser: async () => { calls.updates += 1; listener('USER_UPDATED', session); return { data: { user: session.user }, error: null }; },
      signOut: async () => { listener('SIGNED_OUT', null); return { error: null }; },
    },
    from: () => { calls.profiles += 1; return query; },
    channel: () => channel,
    removeChannel: () => {},
  };
  const mocks = {
    react: React,
    '@react-native-async-storage/async-storage': storage,
    'expo-linking': { getInitialURL: async () => initialUrl, addEventListener: () => ({ remove() {} }) },
    'expo-web-browser': { maybeCompleteAuthSession() {} },
    'expo-apple-authentication': {},
    'expo-auth-session': {},
    'expo-crypto': {},
  };
  const requireMock = (id) => {
    if (id in mocks) return mocks[id];
    if (id.endsWith('/passwordRecovery')) return helper.exports;
    if (id.endsWith('/supabase')) return { isSupabaseConfigured: true, supabase };
    if (id.endsWith('/plans')) return { TRIAL_DAYS: 7 };
    if (id.endsWith('/purchases')) return { identifyPurchaser: async (id) => { calls.purchaserIds.push(id); } };
    throw new Error(`Unmocked import: ${id}`);
  };
  const provider = { exports: {} };
  new Function('module', 'exports', 'require', providerCode)(provider, provider.exports, requireMock);
  const render = () => {
    cursor = 0;
    const value = provider.exports.AuthProvider({ children: null }).props.value;
    const pending = effects;
    effects = [];
    pending.forEach((run) => run());
    return value;
  };
  render();
  return {
    render,
    calls,
    emit: (event) => listener(event, session),
    releaseMarker: () => releaseMarker(marker),
    failUser: (error) => { userError = error; },
    failSession: (error) => { sessionError = error; },
    settle: async () => { await tick(); render(); await tick(); return render(); },
  };
}

test('cold recovery session is not published or used for profiles while marker is pending', async () => {
  const app = setup({ marker: 'active', holdMarker: true });
  app.emit('INITIAL_SESSION');
  assert.equal(app.render().loading, true);
  assert.equal(app.render().user, null);
  assert.equal(app.calls.profiles, 0);
  assert.ok(app.calls.purchaserIds.every((id) => id === null));
  app.releaseMarker();
  const value = await app.settle();
  assert.equal(value.passwordRecovery, 'invalid');
  assert.equal(value.user, null);
  assert.equal(app.calls.profiles, 0);
});

test('ordinary cold session is published only after startup inspection, then loads its profile', async () => {
  const app = setup({ holdMarker: true });
  app.emit('INITIAL_SESSION');
  assert.equal(app.render().user, null);
  assert.equal(app.calls.profiles, 0);
  app.releaseMarker();
  const value = await app.settle();
  assert.equal(value.loading, false);
  assert.equal(value.user.id, 'fixture-user');
  assert.equal(value.passwordRecovery, 'idle');
  assert.equal(app.calls.profiles, 1);
});

for (const method of ['failUser', 'failSession']) {
  test(`resolved retryable ${method === 'failUser' ? 'getUser' : 'getSession'} error preserves recovery for a successful retry`, async () => {
    const app = setup({ initialUrl: 'toxoff://reset-password?code=fixture-code' });
    app.emit('INITIAL_SESSION');
    assert.equal((await app.settle()).passwordRecovery, 'ready');
    app[method]({ name: 'AuthRetryableFetchError', status: 503 });
    await assert.rejects(app.render().resetPassword('fixture-password'), /Check your connection and try again/);
    assert.equal(app.render().passwordRecovery, 'ready');
    assert.equal(app.render().user, null);
    assert.equal(app.calls.updates, 0);
    app[method](null);
    await app.render().resetPassword('fixture-password');
    assert.equal(app.render().passwordRecovery, 'complete');
    assert.equal(app.calls.updates, 1);
    await app.render().leavePasswordRecovery();
    assert.equal(app.render().passwordRecovery, 'idle');
    assert.equal(app.render().user, null);
  });
}

test('a non-retryable missing session invalidates authorization without updating the password', async () => {
  const app = setup({ initialUrl: 'toxoff://reset-password?code=fixture-code' });
  app.emit('INITIAL_SESSION');
  await app.settle();
  app.failUser({ name: 'AuthApiError', code: 'session_not_found', status: 401 });
  await assert.rejects(app.render().resetPassword('fixture-password'), /expired or could not be verified/);
  assert.equal(app.render().passwordRecovery, 'invalid');
  assert.equal(app.calls.updates, 0);
});

test('an ordinary sign-in callback cannot unlock the reset form', async () => {
  const app = setup({ initialUrl: 'toxoff://reset-password?code=fixture-code', exchangeEvent: 'SIGNED_IN' });
  app.emit('INITIAL_SESSION');
  const value = await app.settle();
  assert.equal(value.passwordRecovery, 'invalid');
  assert.equal(value.user, null);
  await assert.rejects(value.resetPassword('fixture-password'), /expired or could not be verified/);
  assert.equal(app.calls.updates, 0);
});
