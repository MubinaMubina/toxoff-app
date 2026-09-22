// Run: node scripts/seed-reviewer.cjs
// Creates (or resets) the login given to app reviewers, with a sample Instagram account and sample
// comments (supabase/migrations/20260921100000_reviewer_demo.sql). Safe to run again: it sets the
// password back to the one in the Keychain and refreshes the sample data.
//
// The password is made here on first run and kept in the macOS Keychain (toxoff-reviewer-password).
// It is never printed. To paste it into App Store Connect:
//   security find-generic-password -s toxoff-reviewer-password -w | pbcopy
const { execFileSync, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const EMAIL = 'appreview@toxoff.app';
const KEYCHAIN = 'toxoff-reviewer-password';
// An ordinary name: Home greets the user by first name, and this login is used for store screenshots.
const NAME = 'Sam Carter';
const root = path.join(__dirname, '..');

function envValue(name) {
  const line = fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} is missing from .env`);
  return line.slice(name.length + 1).trim();
}

function reviewerPassword() {
  const found = spawnSync('security', ['find-generic-password', '-s', KEYCHAIN, '-w'], { encoding: 'utf8' });
  if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  // Letters and digits only, so it survives being typed on a phone keyboard.
  const password = crypto.randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
  execFileSync('security', ['add-generic-password', '-U', '-a', 'toxoff', '-s', KEYCHAIN, '-w', password]);
  return password;
}

function serviceRoleKey(ref) {
  const out = execFileSync('npx', ['supabase', 'projects', 'api-keys', '--project-ref', ref, '--output', 'json'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const key = JSON.parse(out).find((k) => k.name === 'service_role');
  if (!key) throw new Error('No service_role key for this project. Is the Supabase CLI logged in?');
  return key.api_key;
}

async function main() {
  const url = envValue('EXPO_PUBLIC_SUPABASE_URL');
  const ref = new URL(url).hostname.split('.')[0];
  const key = serviceRoleKey(ref);
  const password = reviewerPassword();
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const call = async (method, route, body) => {
    const res = await fetch(`${url}${route}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
  };

  let created = await call('POST', '/auth/v1/admin/users', {
    email: EMAIL, password, email_confirm: true, user_metadata: { full_name: NAME },
  });
  let uid = created.data?.id;
  if (!created.ok) {
    // Already there: find it and put the password back.
    for (let page = 1; !uid && page <= 20; page++) {
      const list = await call('GET', `/auth/v1/admin/users?page=${page}&per_page=200`);
      if (!list.ok) throw new Error(`Could not list users (HTTP ${list.status})`);
      uid = list.data.users.find((u) => u.email === EMAIL)?.id;
      if (list.data.users.length < 200) break;
    }
    if (!uid) throw new Error(`Could not create ${EMAIL} (HTTP ${created.status}: ${created.data?.msg ?? created.data?.error_code})`);
    const reset = await call('PUT', `/auth/v1/admin/users/${uid}`, { password, email_confirm: true, user_metadata: { full_name: NAME } });
    if (!reset.ok) throw new Error(`Could not reset the password (HTTP ${reset.status})`);
  }

  const marked = await call('PATCH', `/rest/v1/profiles?id=eq.${uid}`, { reviewer: true, full_name: NAME });
  if (!marked.ok) throw new Error(`Could not mark the profile (HTTP ${marked.status}: ${marked.data?.message})`);
  const seeded = await call('POST', '/rest/v1/rpc/seed_reviewer_demo', { uid });
  if (!seeded.ok) throw new Error(`Could not seed the sample data (HTTP ${seeded.status}: ${seeded.data?.message})`);

  console.log(`Reviewer login ready: ${EMAIL}`);
  console.log(`Password: in the Keychain as ${KEYCHAIN} (not shown). Copy it with:`);
  console.log(`  security find-generic-password -s ${KEYCHAIN} -w | pbcopy`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
