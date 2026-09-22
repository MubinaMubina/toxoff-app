// Local screenshot navigation. Reads the reviewer password from Keychain only for `login`.
// Credentials and session tokens are never logged or saved.
const { execFileSync } = require('node:child_process');

const target = 'iPhone 17 Pro Max';
const port = Number(process.env.TOXOFF_CAPTURE_PORT || 8081);
const [command, ...args] = process.argv.slice(2);
const prelude = `
const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
if (!hook) throw new Error('React inspector is not ready');
const all = [], seen = new Set();
const stack = [...hook.renderers.keys()].flatMap(id => [...hook.getFiberRoots(id)].map(root => root.current));
while (stack.length) { const f = stack.pop(); if (!f || seen.has(f)) continue; seen.add(f); all.push(f); stack.push(f.sibling, f.child); }
const component = name => all.filter(f => f.type?.name === name).slice(-1)[0];
const descendants = root => { const out = [], stack = [root?.child]; while (stack.length) { const f = stack.pop(); if (!f) continue; out.push(f); stack.push(f.sibling, f.child); } return out; };
const textOf = value => typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(textOf).join('') : '';
`;

async function evaluate(body, { secret = false } = {}) {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const candidates = pages.filter(p => p.deviceName === target && p.reactNative?.capabilities?.prefersFuseboxFrontend).reverse();
  let ws;
  for (const page of candidates) {
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    const ready = await new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 3000);
      socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id === 0) { clearTimeout(timer); resolve(message.result?.result?.value === true); }
      };
      socket.send(JSON.stringify({ id: 0, method: 'Runtime.evaluate', params: {
        expression: 'Boolean(globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.size)', returnByValue: true,
      } }));
    });
    if (ready) { ws = socket; break; }
    socket.close();
  }
  if (!ws) throw new Error('The 6.9-inch app inspector is not ready.');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error('Inspector timed out')); }, 45000);
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer); ws.close();
      if (message.error || message.result?.exceptionDetails) {
        reject(new Error(secret ? 'Reviewer sign-in failed; no credentials logged.' : JSON.stringify(message.error ?? message.result.exceptionDetails)));
      } else resolve(message.result?.result?.value);
    };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
      expression: `(() => { ${prelude}\n${body}\n})()`, returnByValue: true, awaitPromise: true,
    } }));
  });
}

async function main() {
  let body;
  if (command === 'login') {
    const password = execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'toxoff-reviewer-password', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (!password) throw new Error('Reviewer password is missing from Keychain.');
    const authArgs = JSON.stringify(['appreview@toxoff.app', password]);
    const result = await evaluate(`
      const auth = all.find(f => f.memoizedProps?.value?.signIn && f.memoizedProps?.value?.signOut)?.memoizedProps.value;
      if (!auth) throw new Error('Auth context unavailable');
      return auth.signIn(...${authArgs}).then(() => 'Reviewer sign-in completed');
    `, { secret: true });
    console.log(result); return;
  }
  if (command === 'inspect') body = `
    const auth = all.find(f => f.memoizedProps?.value?.signIn)?.memoizedProps.value;
    const moderation = all.find(f => f.memoizedProps?.value?.restoreComment)?.memoizedProps.value;
    const loaded = [...__r.getModules().entries()];
    const exported = name => { const entry = loaded.find(([,v]) => v.verboseName?.includes(name)); return entry ? __r(entry[0]) : {}; };
    return { reviewer: auth?.user?.email === 'appreview@toxoff.app', plan: auth?.subscription?.plan,
      status: moderation?.status, accounts: moderation?.accounts?.map(a => ({ demoHandle: a.handle === '@toxoff.demo' || a.handle === 'toxoff.demo', connected: a.connected, paused: a.paused })),
      comments: moderation?.comments?.length, freeChecks: moderation?.freeChecks, logVisibility: moderation?.preferences?.logVisibility,
      storeConfigured: exported('src/lib/purchases').storeConfigured,
      adsEnabled: exported('src/data/plans').ADS_ENABLED };
  `;
  else if (command === 'prepare') body = `
    const entries = [...__r.getModules().entries()];
    const logbox = entries.find(([,v]) => v.verboseName?.includes('/LogBox/LogBox.'));
    if (logbox) { const exports = __r(logbox[0]); (exports.default || exports).ignoreAllLogs(true); }
    return { logboxHidden: Boolean(logbox), modules: entries.filter(([,v]) => /purchases|LogBox|expo-router.*exports|expo-router.*imperative/.test(v.verboseName || '')).map(([id,v]) => ({id,name:v.verboseName})).slice(0,12) };
  `;
  else if (command === 'screen') body = `
    const root = component(${JSON.stringify(args[0])});
    if (!root) throw new Error('Screen is not mounted');
    return [...new Set(descendants(root).filter(f => f.type === 'RCTText' || f.type?.name === 'Text').map(f => textOf(f.memoizedProps?.children)).filter(Boolean))];
  `;
  else if (command === 'route') body = `
    const entry = [...__r.getModules().entries()].find(([,v]) => v.verboseName?.includes('expo-router/build/imperative-api'));
    if (!entry) throw new Error('Router unavailable');
    __r(entry[0]).router.push(${JSON.stringify(args[0])}); return 'Navigated';
  `;
  else if (command === 'press') body = `
    const label = ${JSON.stringify(args[0])};
    let f = all.filter(f => typeof f.memoizedProps?.onPress === 'function' && (f.memoizedProps.accessibilityLabel === label || f.memoizedProps.label === label)).slice(-1)[0];
    if (!f) { f = all.filter(f => textOf(f.memoizedProps?.children) === label).slice(-1)[0]; while (f && typeof f.memoizedProps?.onPress !== 'function') f = f.return; }
    if (!f) throw new Error('No button: ' + label);
    f.memoizedProps.onPress({ nativeEvent: {}, preventDefault() {} }); return 'Pressed ' + label;
  `;
  else if (command === 'expand-hidden') body = `
    const row = all.find(f => f.type?.name === 'LogRow' && f.memoizedProps.comment?.action === 'hidden' && !f.memoizedProps.comment?.restored);
    const press = descendants(row).find(f => f.memoizedProps?.accessibilityHint === 'Expand comment details.' && typeof f.memoizedProps?.onPress === 'function');
    if (!press) throw new Error('No collapsed hidden comment'); press.memoizedProps.onPress(); return 'Expanded hidden comment';
  `;
  else if (command === 'scroll') body = `
    const root = component(${JSON.stringify(args[0])});
    const scroller = descendants(root).find(f => typeof f.stateNode?.scrollTo === 'function');
    if (!scroller) throw new Error('Scroll view unavailable');
    scroller.stateNode.scrollTo({ y: ${Number(args[1]) || 0}, x: 0, animated: false }); return 'Scrolled';
  `;
  else if (command === 'light') body = `
    let state = component('ThemeProvider')?.memoizedState;
    while (state) { if (state.queue?.dispatch && ['light','dark','system'].includes(state.memoizedState)) { state.queue.dispatch('light'); return 'Light mode preview'; } state = state.next; }
    throw new Error('Theme state unavailable');
  `;
  else if (command === 'visibility') body = `
    const moderation = all.find(f => f.memoizedProps?.value?.setLogVisibility)?.memoizedProps.value;
    if (!moderation) throw new Error('Moderation context unavailable');
    moderation.setLogVisibility(${JSON.stringify(args[0])}); return 'Log visibility: ' + ${JSON.stringify(args[0])};
  `;
  else if (command === 'eval') body = `return (${args[0]});`;
  else throw new Error('Use login, inspect, press LABEL, expand-hidden, scroll COMPONENT Y, visibility VALUE, or light.');
  console.log(JSON.stringify(await evaluate(body), null, 2));
  if (command !== 'inspect') await new Promise(resolve => setTimeout(resolve, 750));
}

main().catch(error => { console.error(command === 'login' ? 'Reviewer sign-in could not complete. Credentials were not logged.' : error.message); process.exitCode = 1; });
