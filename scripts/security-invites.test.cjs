// Run: node --test scripts/security-invites.test.cjs
// GSTACK-SEC-02 /qa regression: artifacts/security-review-2026-09-16.md.
// Requires PostgreSQL 14+ tools on PATH, or PG_BIN pointing to their directory.
// SECURITY_INVITES_BASELINE=1 omits the fix and must fail the same security assertions.
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const test = require('node:test');

const migrations = path.join(__dirname, '..', 'supabase', 'migrations');
const user = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const binary = (name) => process.env.PG_BIN ? path.join(process.env.PG_BIN, name) : name;

test('invite security against an isolated PostgreSQL database', { timeout: 60000 }, async (t) => {
  // A short private path also stays below macOS's Unix socket path length limit.
  const root = fs.mkdtempSync(path.join(process.platform === 'darwin' ? '/tmp' : os.tmpdir(), 'toxoff-invites-'));
  const data = path.join(root, 'data');
  const sockets = path.join(root, 'socket');
  fs.mkdirSync(sockets, { mode: 0o700 });
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  env.PGPASSFILE = path.join(root, 'no-password-file');
  const children = new Set();
  let running = false;

  function run(name, args, input) {
    const result = spawnSync(binary(name), args, { env, input, encoding: 'utf8', timeout: 15000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${name} failed:\n${result.stderr}\n${result.stdout}`);
    return result.stdout.trim();
  }

  t.after(() => {
    for (const child of children) child.kill('SIGTERM');
    if (running || fs.existsSync(path.join(data, 'postmaster.pid'))) {
      run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  run('initdb', ['-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--encoding=UTF8', '--locale=C']);
  run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o',
    `-c listen_addresses= -c unix_socket_directories=${sockets} -c unix_socket_permissions=0700 -p 55439`, '-w', 'start']);
  running = true;
  const args = ['-X', '-w', '-h', sockets, '-p', '55439', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'];
  const sql = (input) => run('psql', args, input);
  sql(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      raw_user_meta_data jsonb not null default '{}',
      created_at timestamptz not null default now()
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to authenticated;
  `);
  for (const name of [
    '20260912000000_initial_schema.sql',
    '20260912200000_moderation_engine.sql',
    '20260913000000_billing.sql',
    '20260914020000_invites.sql',
  ]) run('psql', [...args, '-f', path.join(migrations, name)]);
  if (process.env.SECURITY_INVITES_BASELINE !== '1') {
    const fixes = fs.readdirSync(migrations).filter((name) => name.endsWith('_serialize_reciprocal_invites.sql'));
    assert.equal(fixes.length, 1, 'Expected the reciprocal invite security migration');
    run('psql', [...args, '-f', path.join(migrations, fixes[0])]);
  }
  sql(`
    insert into auth.users (id) values ('${user(1)}'), ('${user(2)}'), ('${user(3)}'), ('${user(4)}');
    insert into public.invite_codes (code, owner_id) values
      ('FRIENDDA', '${user(1)}'), ('FRIENDDB', '${user(2)}'),
      ('FRIENDDC', '${user(3)}'), ('FRIENDDD', '${user(4)}');
  `);

  async function waitFor(predicate, description) {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
      assert.ok(Date.now() < deadline, `Timed out: ${description}`);
      await delay(10);
    }
  }

  function session(name) {
    const child = spawn(binary('psql'), args, { env: { ...env, PGAPPNAME: name }, stdio: ['pipe', 'pipe', 'pipe'] });
    children.add(child);
    const state = { child, stdout: '', stderr: '', ended: false, code: null };
    child.stdout.on('data', (chunk) => { state.stdout += chunk; });
    child.stderr.on('data', (chunk) => { state.stderr += chunk; });
    child.on('error', (error) => { state.stderr += error.message; });
    child.on('close', (code) => {
      state.ended = true;
      state.code = code;
      children.delete(child);
    });
    return state;
  }

  const a = session('security-invites-a');
  a.child.stdin.write(`
    begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${user(1)}', true);
    select 'a:' || public.redeem_invite_code('FRIENDDB');
    select 'a-ready';
  `);
  await waitFor(() => a.stdout.includes('a-ready') || a.ended, 'first redemption remains uncommitted');
  assert.match(a.stdout, /a:pending/, a.stderr);
  const b = session('security-invites-b');
  b.child.stdin.end(`
    begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${user(2)}', true);
    select 'b:' || public.redeem_invite_code('FRIENDDA');
    commit;
  `);
  // Synchronize on the actual lock wait, or completion in vulnerable code, not elapsed time.
  await waitFor(() => b.ended || sql(`
    select count(*) from pg_stat_activity
    where application_name = 'security-invites-b' and wait_event = 'advisory';
  `) === '1', 'reciprocal call reaches the authorization check');
  a.child.stdin.end('commit;\n');
  await waitFor(() => a.ended && b.ended, 'both invite transactions finish');
  assert.equal(a.code, 0, a.stderr);
  assert.equal(b.code, 0, b.stderr);

  await t.test('concurrent reciprocal redemption is rejected', () => {
    assert.match(b.stdout, /b:invited_you/, 'The reverse invitation must see the first committed redemption');
  });

  await t.test('connecting both accounts rewards the friendship only once', () => {
    sql(`insert into public.accounts (user_id, platform, handle, platform_user_id) values
      ('${user(1)}', 'instagram', 'fixture-a', 'fixture-platform-a'),
      ('${user(2)}', 'instagram', 'fixture-b', 'fixture-platform-b');`);
    assert.equal(sql(`select bonus_comment_checks from public.profiles
      where id in ('${user(1)}', '${user(2)}') order by id;`), '5\n5');
  });

  function redeem(uid, code) {
    return sql(`begin; set local role authenticated;
      set local request.jwt.claim.sub = '${uid}';
      select public.redeem_invite_code('${code}'); commit;`);
  }

  await t.test('ordinary invitations and redemption guards still work', () => {
    assert.equal(redeem(user(4), 'FRIENDDD'), 'own_code');
    assert.equal(redeem(user(3), 'friend-dd'), 'pending');
    sql(`insert into public.accounts (user_id, platform, handle, platform_user_id)
      values ('${user(3)}', 'instagram', 'fixture-c', 'fixture-platform-c');`);
    assert.equal(sql(`select bonus_comment_checks from public.profiles
      where id in ('${user(3)}', '${user(4)}') order by id;`), '5\n5');
    assert.equal(redeem(user(3), 'FRIENDDA'), 'already_redeemed');
    assert.equal(redeem(user(4), 'FRIENDDC'), 'invited_you');
  });

  await t.test('RPC authentication and internal function privileges remain restricted', () => {
    const unsigned = spawnSync(binary('psql'), args, {
      env, encoding: 'utf8', timeout: 5000,
      input: "set role authenticated; select public.redeem_invite_code('FRIENDDA');",
    });
    assert.ifError(unsigned.error);
    assert.notEqual(unsigned.status, 0);
    assert.match(unsigned.stderr, /Not signed in/);
    assert.equal(sql(`select
      has_function_privilege('authenticated', 'public.redeem_invite_code(text)', 'EXECUTE'),
      has_function_privilege('anon', 'public.redeem_invite_code(text)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.grant_invite_reward(uuid)', 'EXECUTE');`), 't|f|f');
  });
});
