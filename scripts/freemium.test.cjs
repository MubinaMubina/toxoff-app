// Run: node --test scripts/freemium.test.cjs
// The Free plan's rules (supabase/migrations/20260916100000_freemium_ads.sql) against an isolated
// PostgreSQL: 50 checks a month, the bonus pool, rewarded-ad grants, the 7-day log window, and
// who may call what. Requires PostgreSQL 14+ tools on PATH, or PG_BIN pointing to their directory.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const migrations = path.join(__dirname, '..', 'supabase', 'migrations');
const user = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const binary = (name) => process.env.PG_BIN ? path.join(process.env.PG_BIN, name) : name;

test('the Free plan against an isolated PostgreSQL database', { timeout: 120000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(process.platform === 'darwin' ? '/tmp' : os.tmpdir(), 'toxoff-free-'));
  const data = path.join(root, 'data');
  const sockets = path.join(root, 'socket');
  fs.mkdirSync(sockets, { mode: 0o700 });
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  env.PGPASSFILE = path.join(root, 'no-password-file');
  let running = false;

  function run(name, args, input) {
    const result = spawnSync(binary(name), args, { env, input, encoding: 'utf8', timeout: 30000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${name} failed:\n${result.stderr}\n${result.stdout}`);
    return result.stdout.trim();
  }

  t.after(() => {
    if (running || fs.existsSync(path.join(data, 'postmaster.pid'))) {
      run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  run('initdb', ['-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--encoding=UTF8', '--locale=C']);
  run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o',
    `-c listen_addresses= -c unix_socket_directories=${sockets} -c unix_socket_permissions=0700 -p 55441`, '-w', 'start']);
  running = true;
  const args = ['-X', '-w', '-h', sockets, '-p', '55441', '-U', 'postgres', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'];
  const sql = (input) => run('psql', args, input);
  // Fails (non-zero exit) instead of asserting, for statements that must be refused.
  const refused = (input) => {
    const result = spawnSync(binary('psql'), args, { env, input, encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, `Expected to be refused:\n${input}\n${result.stdout}`);
    return result.stderr;
  };
  // The app's queries: as the authenticated role, with the user's id in the JWT claim.
  const asUser = (uid, statements) => sql(`begin; set local role authenticated;
    set local request.jwt.claim.sub = '${uid}'; ${statements} commit;`);
  const asUserRefused = (uid, statements) => refused(`begin; set local role authenticated;
    set local request.jwt.claim.sub = '${uid}'; ${statements} commit;`);

  sql(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
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
  for (const name of fs.readdirSync(migrations).filter((n) => n.endsWith('.sql')).sort()) {
    run('psql', [...args, '-f', path.join(migrations, name)]);
  }

  await t.test('new accounts start on Free, with no trial', () => {
    sql(`insert into auth.users (id, raw_user_meta_data) values
      ('${user(1)}', '{"full_name": "One"}'), ('${user(2)}', '{}'), ('${user(3)}', '{}');`);
    assert.equal(sql(`select plan is null, sub_status, free_comments_used, bonus_comment_checks,
      public.effective_plan('${user(1)}') from public.profiles where id = '${user(1)}';`), 't|none|0|0|free');
    assert.equal(sql(`select count(*) from information_schema.columns
      where table_name = 'profiles' and column_name = 'trial_ends_at';`), '0');
    // New accounts start strict: High sensitivity, every flagged comment deleted.
    assert.equal(sql(`select sensitivity, flagged_action from public.filters where user_id = '${user(1)}';`), 'high|delete');
    assert.equal(sql(`select monthly_checks, log_history_days, ads from public.plan_limits where plan = 'free';`), '50|7|t');
    assert.equal(sql(`select monthly_checks is null, log_history_days is null, ads from public.plan_limits where plan = 'plus';`), 't|t|f');
  });

  await t.test('free_period_start: the latest monthly anniversary of joining', () => {
    const at = (joined, now) => sql(`select public.free_period_start('${joined}'::timestamptz, '${now}'::timestamptz) at time zone 'UTC';`);
    assert.equal(at('2026-01-31 10:00+00', '2026-01-31 10:00+00'), '2026-01-31 10:00:00');
    assert.equal(at('2026-01-31 10:00+00', '2026-02-28 09:00+00'), '2026-01-31 10:00:00');
    assert.equal(at('2026-01-31 10:00+00', '2026-03-01 09:00+00'), '2026-02-28 10:00:00');
    assert.equal(at('2026-01-31 10:00+00', '2026-03-31 10:00+00'), '2026-03-31 10:00:00');
    assert.equal(at('2026-01-15 10:00+00', '2027-01-14 10:00+00'), '2026-12-15 10:00:00');
  });

  await t.test('50 checks a month, then the bonus pool, then nothing', () => {
    const claim = (n) => sql(`select public.claim_comment('${user(1)}', 'instagram', 'c${n}');`);
    for (let n = 1; n <= 50; n++) assert.equal(claim(n), 'claimed', `comment ${n}`);
    assert.equal(claim(51), 'no_checks_left');
    assert.equal(sql(`select free_comments_used from public.profiles where id = '${user(1)}';`), '50');
    sql(`update public.profiles set bonus_comment_checks = 2 where id = '${user(1)}';`);
    assert.equal(claim(52), 'claimed');
    assert.equal(sql(`select free_comments_used, bonus_comment_checks from public.profiles where id = '${user(1)}';`), '50|1');
    assert.equal(sql(`select counted, counted_bonus from public.comment_claims where comment_id = 'c52';`), 't|t');
    // A failed check gives the bonus check back, not a monthly one.
    sql(`select public.release_comment('instagram', 'c52');`);
    assert.equal(sql(`select free_comments_used, bonus_comment_checks from public.profiles where id = '${user(1)}';`), '50|2');
    sql(`select public.release_comment('instagram', 'c50');`);
    assert.equal(sql(`select free_comments_used, bonus_comment_checks from public.profiles where id = '${user(1)}';`), '49|2');
    assert.equal(claim(53), 'claimed');
    assert.equal(sql(`select free_comments_used, bonus_comment_checks from public.profiles where id = '${user(1)}';`), '50|2');
  });

  await t.test('a new month starts the count again and keeps the bonus pool', () => {
    // Joined a month and a day ago, last counted in that first month.
    sql(`update public.profiles set created_at = now() - interval '1 month 1 day',
      free_period_start = now() - interval '1 month 1 day' where id = '${user(1)}';`);
    assert.equal(sql(`select public.claim_comment('${user(1)}', 'instagram', 'c60');`), 'claimed');
    assert.equal(sql(`select free_comments_used, bonus_comment_checks,
      free_period_start = public.free_period_start(created_at) from public.profiles where id = '${user(1)}';`), '1|2|t');
  });

  await t.test('paid plans are unlimited and not counted', () => {
    sql(`update public.profiles set sub_status = 'active', plan = 'solo' where id = '${user(3)}';`);
    assert.equal(sql(`select public.claim_comment('${user(3)}', 'instagram', 'p1');`), 'claimed');
    assert.equal(sql(`select counted from public.comment_claims where comment_id = 'p1';`), 'f');
    assert.equal(sql(`select free_comments_used from public.profiles where id = '${user(3)}';`), '0');
  });

  await t.test('rewarded ads: 5 checks each, 2 a day, once per reward, never for paying users', () => {
    const grant = (uid, id) => sql(`select public.grant_ad_reward('${uid}', '${id}', 'unit-1');`);
    assert.equal(grant(user(2), 'tx1'), 'granted');
    assert.equal(grant(user(2), 'tx1'), 'duplicate');
    assert.equal(grant(user(2), 'tx2'), 'granted');
    assert.equal(grant(user(2), 'tx3'), 'limit');
    assert.equal(sql(`select bonus_comment_checks from public.profiles where id = '${user(2)}';`), '10');
    assert.equal(sql(`select count(*) from public.ad_rewards where user_id = '${user(2)}';`), '2');
    // Yesterday's ads don't count today.
    sql(`update public.ad_rewards set created_at = now() - interval '25 hours' where transaction_id = 'tx1';`);
    assert.equal(grant(user(2), 'tx3'), 'granted');
    assert.equal(grant(user(3), 'tx4'), 'paying');
    assert.equal(grant('00000000-0000-4000-8000-999999999999', 'tx5'), 'unknown_user');
    assert.equal(sql(`select checks_granted from public.ad_rewards where transaction_id = 'tx3';`), '5');
  });

  await t.test('the app sees only its own ad rewards, and cannot add or edit any', () => {
    assert.equal(asUser(user(2), `select count(*) from public.ad_rewards;`), '3');
    assert.equal(asUser(user(1), `select count(*) from public.ad_rewards;`), '0');
    asUserRefused(user(1), `insert into public.ad_rewards (user_id, transaction_id, checks_granted) values ('${user(1)}', 'x', 500);`);
    asUserRefused(user(1), `update public.profiles set bonus_comment_checks = 500 where id = '${user(1)}';`);
    asUserRefused(user(1), `update public.profiles set free_comments_used = 0 where id = '${user(1)}';`);
    asUserRefused(user(1), `update public.profiles set free_period_start = now() where id = '${user(1)}';`);
    asUserRefused(user(1), `select public.grant_ad_reward('${user(1)}', 'y', null);`);
    asUserRefused(user(1), `select public.consume_comment_check('${user(1)}');`);
    assert.equal(sql(`select
      has_function_privilege('authenticated', 'public.grant_ad_reward(uuid, text, text)', 'EXECUTE'),
      has_function_privilege('anon', 'public.moderation_counts()', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.moderation_counts()', 'EXECUTE');`), 'f|f|t');
  });

  await t.test('on Free the log reaches back 7 days; totals and paid plans see it all', () => {
    sql(`insert into public.moderation_log (user_id, platform, username, text, reason, created_at) values
      ('${user(1)}', 'instagram', 'a', 'recent', 'harassment', now() - interval '1 day'),
      ('${user(1)}', 'instagram', 'b', 'older', 'harassment', now() - interval '10 days'),
      ('${user(2)}', 'instagram', 'c', 'other user', 'harassment', now());`);
    assert.equal(asUser(user(1), `select string_agg(text, ',') from public.moderation_log;`), 'recent');
    assert.equal(asUser(user(1), `select public.moderation_counts()::text;`), '{"today" : 0, "week" : 1, "month" : 2}');
    sql(`update public.profiles set sub_status = 'active', plan = 'plus' where id = '${user(1)}';`);
    assert.equal(asUser(user(1), `select string_agg(text, ',' order by created_at desc) from public.moderation_log;`), 'recent,older');
    sql(`update public.profiles set sub_status = 'none', plan = null where id = '${user(1)}';`);
    assert.equal(asUser(user(1), `select count(*) from public.moderation_log;`), '1');
  });

  await t.test('a subscription ending goes to Free, not a trial', () => {
    sql(`update public.profiles set billing_store = null where id = '${user(2)}';`);
    assert.equal(sql(`select public.apply_store_billing('${user(2)}', 'active', 'plus', 'monthly', now() + interval '30 days', false);`), 't');
    assert.equal(sql(`select public.effective_plan('${user(2)}');`), 'plus');
    assert.equal(sql(`select public.apply_store_billing('${user(2)}', 'none', null, null, null, false);`), 't');
    assert.equal(sql(`select plan is null, sub_status, public.effective_plan('${user(2)}') from public.profiles where id = '${user(2)}';`), 't|none|free');
  });

  await t.test('security review: claims come back, stale claims are retaken, limits and bounds hold', () => {
    // A comment claimed while out of checks is not lost: the claim is released.
    sql(`update public.profiles set free_comments_used = 50, bonus_comment_checks = 0,
      free_period_start = public.free_period_start(created_at) where id = '${user(2)}';`);
    assert.equal(sql(`select public.claim_comment('${user(2)}', 'instagram', 'late1');`), 'no_checks_left');
    assert.equal(sql(`select count(*) from public.comment_claims where comment_id = 'late1';`), '0');
    sql(`update public.profiles set bonus_comment_checks = 1 where id = '${user(2)}';`);
    assert.equal(sql(`select public.claim_comment('${user(2)}', 'instagram', 'late1');`), 'claimed');
    // A claim that never produced a log row can be retaken after 15 minutes, not before.
    assert.equal(sql(`select public.claim_comment('${user(2)}', 'instagram', 'late1');`), 'duplicate');
    sql(`update public.comment_claims set created_at = now() - interval '16 minutes' where comment_id = 'late1';`);
    sql(`update public.profiles set sub_status = 'active', plan = 'plus' where id = '${user(2)}';`);
    assert.equal(sql(`select public.claim_comment('${user(2)}', 'instagram', 'late1');`), 'claimed');
    // ...but not once the comment was logged (it was handled).
    sql(`insert into public.moderation_log (user_id, platform, username, text, reason, comment_id)
      values ('${user(2)}', 'instagram', 'a', 'x', 'spam', 'late1');
      update public.comment_claims set created_at = now() - interval '1 hour' where comment_id = 'late1';`);
    assert.equal(sql(`select public.claim_comment('${user(2)}', 'instagram', 'late1');`), 'duplicate');
    sql(`update public.profiles set sub_status = 'none', plan = null where id = '${user(2)}';`);

    // Per-minute route limit: the app can't call it, the backend can, and it stops at the limit.
    assert.equal(sql(`select has_function_privilege('authenticated', 'public.take_call(text, int)', 'EXECUTE');`), 'f');
    assert.equal(sql(`select string_agg(public.take_call('t:${user(2)}', 2)::text, ',') from generate_series(1, 3);`), 'true,true,false');

    // Bounds on what the app may store.
    asUserRefused(user(1), `update public.profiles set full_name = repeat('a', 121) where id = '${user(1)}';`);
    asUserRefused(user(1), `update public.filters set keywords = array_fill('k'::text, array[501]) where user_id = '${user(1)}';`);
    asUser(user(1), `update public.filters set keywords = array_fill('k'::text, array[500]) where user_id = '${user(1)}';`);
    assert.equal(sql(`select is_nullable from information_schema.columns where table_name = 'profiles' and column_name = 'created_at';`), 'NO');
    assert.equal(sql(`select has_function_privilege('authenticated', 'public.free_period_start(timestamptz, timestamptz)', 'EXECUTE');`), 'f');
  });

  await t.test('the reviewer login: a sample account and comments that stay inside the 7-day log', () => {
    // Only a profile marked as the reviewer login is seeded, and only by the backend.
    refused(`select public.seed_reviewer_demo('${user(3)}');`);
    assert.equal(sql(`select has_function_privilege('authenticated', 'public.seed_reviewer_demo(uuid)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.seed_reviewer_demo(uuid)', 'EXECUTE');`), 'f|t');
    asUserRefused(user(3), `update public.profiles set reviewer = true where id = '${user(3)}';`);
    asUserRefused(user(3), `update public.accounts set demo = true where user_id = '${user(3)}';`);

    sql(`update public.profiles set reviewer = true where id = '${user(3)}';
      select public.seed_reviewer_demo('${user(3)}');`);
    assert.equal(sql(`select handle, demo, connected, paused, platform_user_id is null from public.accounts
      where user_id = '${user(3)}';`), 'toxoff.demo|t|t|f|t');
    assert.equal(sql(`select onboarded_at is not null, free_comments_used from public.profiles where id = '${user(3)}';`), 't|14');
    // The sample account doesn't use up the Free plan's one real account.
    sql(`insert into public.accounts (user_id, platform, handle) values ('${user(3)}', 'instagram', 'real');`);
    refused(`insert into public.accounts (user_id, platform, handle) values ('${user(3)}', 'instagram', 'second');`);
    sql(`delete from public.accounts where user_id = '${user(3)}' and handle = 'real';`);
    // Everything seeded is visible on Free, and still will be just before tomorrow's refresh.
    assert.equal(asUser(user(3), `select count(*), count(*) filter (where action = 'hidden'),
      count(*) filter (where created_at > now() - interval '6 days') from public.moderation_log;`), '12|4|12');
    // Each sample names its post, as real comments do, so the Log's "Posted on" row isn't blank.
    assert.equal(sql(`select count(*) filter (where post_ref ~ '^(Reel|Post) · ') from public.moderation_log
      where user_id = '${user(3)}';`), '12');

    // A refresh undoes what the reviewer did, without doubling up or touching real comments.
    sql(`update public.accounts set paused = true where user_id = '${user(3)}';
      update public.moderation_log set restored = true where user_id = '${user(3)}';
      insert into public.moderation_log (user_id, platform, username, text, reason, comment_id)
        values ('${user(3)}', 'instagram', 'real', 'a real comment', 'spam', 'ig-1');
      select public.seed_reviewer_demo('${user(3)}');`);
    assert.equal(sql(`select count(*) from public.accounts where user_id = '${user(3)}';`), '1');
    assert.equal(sql(`select paused from public.accounts where user_id = '${user(3)}';`), 'f');
    assert.equal(sql(`select count(*), count(*) filter (where restored), count(*) filter (where comment_id = 'ig-1')
      from public.moderation_log where user_id = '${user(3)}';`), '13|0|1');
  });
});
