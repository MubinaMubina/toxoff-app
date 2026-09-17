# toxoff Security Review, 2026-09-16

Status: **partial code audit; two supported findings patched locally**.

No active freeze file was found at the resolved gstack state root or in the project.
The starting worktree already contained application and UI changes. Security edits preserve
those changes. No commits, remote deployments, production database writes, live account creation,
real purchases, or credential probes were performed.

## Phase 1: Vulnerability Matrix

| ID / title | CVSS v4.0 estimate | Business priority | Affected source |
| --- | --- | --- | --- |
| GSTACK-SEC-01: Sandbox purchases grant production entitlements, CWE-841 | **6.3 Medium** | Medium | `supabase/functions/api/store.ts:57`, `supabase/functions/api/env.ts:37` |
| GSTACK-SEC-02: Reciprocal invite redemption race, CWE-362 | **6.3 Medium** | Low | `supabase/migrations/20260914020000_invites.sql:197`; repaired by `supabase/migrations/20260916050144_serialize_reciprocal_invites.sql` |

For both, the estimated base vector is:
`CVSS:4.0/AV:N/AC:L/AT:P/PR:N/UI:N/VC:N/VI:L/VA:N/SC:N/SI:N/SA:N`.

The score was calculated with [FIRST's official calculator](https://github.com/FIRSTdotorg/cvss-v4-calculator).
PR:N assumes the app's public signup permits attackers to provision their own accounts; AT:P
captures access to a qualifying sandbox build/shared backend or the required concurrent
transaction schedule. If accounts require privileges granted by an administrator, PR:L gives
2.3 Low instead. The referral exploit's small credit gain gives it lower business priority
despite the same technical base vector. These are local estimates, not assigned CVE scores.
[FIRST specification](https://www.first.org/cvss/v4.0/specification-document#Exploitability-Metrics),
[FIRST severity versus risk guidance](https://www.first.org/cvss/v4.0/user-guide#CVSS-Base-Score-CVSS-B-Measures-Severity-not-Risk).

### GSTACK-SEC-01

**Root cause and vector:** `StoreSubscription` carries `is_sandbox`, but the original
`storeBillingState` selected any recognized, unexpired, non-refunded purchase and ranked it
by plan. Both authenticated `syncAppStore` and authorized RevenueCat webhooks reach
`syncStoreBilling`, which writes the resulting entitlement through service-role
`apply_store_billing`. A test-distribution user can obtain a no-charge sandbox Studio
purchase and acquire production paid benefits or supersede an existing paid Solo plan.

The README explicitly configures sandbox and production webhook events together.
[RevenueCat documents that a single user may have both production and sandbox receipts](https://www.revenuecat.com/docs/test-and-launch/sandbox).
The attacker still needs the sandbox distribution prerequisite; this does not establish
unsigned receipt forgery or unauthenticated access.

**Independent challenge:** The API reviewer confirmed session validation, server retrieval of
RevenueCat state, and database ownership/grants. Those controls authenticate the source and
user, but do not distinguish a test purchase from a production payment.

**Repair:** Reject sandbox receipts by default; only the literal server setting
`REVENUECAT_ALLOW_SANDBOX=true` enables sandbox entitlements in an isolated test deployment.
Production receipts take priority even when testing is enabled. Existing product IDs,
response fields, cancellation, refund, grace-period behavior, and two-argument helper callers
remain compatible.

### GSTACK-SEC-02

**Root cause and vector:** `redeem_invite_code` checks for the reverse relationship before
updating the requested code, without a shared lock for the two users. Two newly registered
users, before connecting Instagram, can hold separate transactions: A redeems B's code;
before A commits, B redeems A's code. Both see no committed reverse redemption and update
different rows. After both commit and connect new platform accounts, both invitations are
rewarded, giving each user ten extra checks instead of five.

**Independent challenge:** The database reviewer checked the unique `redeemed_by` constraint
and existing per-inviter reward lock. Different redeemers do not collide with that unique
constraint. The reward function returns before its lock when neither user has connected a
platform account, leaving both pending redemptions possible.

**Repair:** A new migration replaces the RPC with a transaction advisory lock derived from
the sorted UUID pair, acquired before checking the reverse relationship. Both directions
contend for the same lock; the next READ COMMITTED statement observes the first committed
redemption. Existing authorization, return values, reward limits, and function privileges
are preserved. [PostgreSQL transaction advisory locks](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).

## Phase 2: Applied Patches

The exact production-source diff is below; it is also saved as
[`security-patches-2026-09-16.diff`](security-patches-2026-09-16.diff).
The existing invite migration is preserved; the new migration is applied after it.

```diff
diff --git a/supabase/functions/api/env.ts b/supabase/functions/api/env.ts
index efc80b5..39674f1 100644
--- a/supabase/functions/api/env.ts
+++ b/supabase/functions/api/env.ts
@@ -34,6 +34,8 @@ export const env = {
   // value set on its webhook.
   revenuecatSecretKey: () => setting('REVENUECAT_SECRET_KEY'),
   revenuecatWebhookAuth: () => setting('REVENUECAT_WEBHOOK_AUTH'),
+  // Enable only in isolated test deployments; sandbox purchases do not represent payment.
+  revenuecatAllowSandbox: () => Deno.env.get('REVENUECAT_ALLOW_SANDBOX') === 'true',
   stripeSecretKey: () => setting('STRIPE_SECRET_KEY'),
   stripeWebhookSecret: () => setting('STRIPE_WEBHOOK_SECRET'),
 };
diff --git a/supabase/functions/api/store.ts b/supabase/functions/api/store.ts
index 579b77d..ed00555 100644
--- a/supabase/functions/api/store.ts
+++ b/supabase/functions/api/store.ts
@@ -52,17 +52,23 @@ const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : 0);
 /**
  * What the user's App Store subscriptions mean for the app. Counts while it's paid up or in
  * Apple's billing grace period (past_due: Apple is retrying the card). Refunded ones don't count.
- * If two overlap (a plan switch), the bigger plan wins, then the one that runs longest.
+ * Sandbox purchases require an explicit test-environment opt-in. Production purchases always win
+ * over sandbox ones; within an environment, the bigger plan wins, then the one that runs longest.
  */
-export function storeBillingState(subscriptions: Record<string, StoreSubscription>, now = Date.now()): StoreBilling {
+export function storeBillingState(
+  subscriptions: Record<string, StoreSubscription>,
+  now = Date.now(),
+  allowSandbox = false
+): StoreBilling {
   const live = Object.entries(subscriptions)
     .map(([productId, sub]) => ({ sub, planned: planOfProduct(productId) }))
     .filter(({ sub, planned }) => {
       const until = Math.max(time(sub.expires_date), time(sub.grace_period_expires_date));
-      return planned && !sub.refunded_at && until > now;
+      return planned && (allowSandbox || sub.is_sandbox !== true) && !sub.refunded_at && until > now;
     })
     .sort(
       (a, b) =>
+        Number(a.sub.is_sandbox === true) - Number(b.sub.is_sandbox === true) ||
         PLAN_RANK[b.planned!.plan] - PLAN_RANK[a.planned!.plan] ||
         time(b.sub.expires_date) - time(a.sub.expires_date)
     );
@@ -88,7 +94,7 @@ async function subscriber(uid: string): Promise<Record<string, StoreSubscription
 
 /** Re-reads the user from RevenueCat and copies their subscription onto the profile. */
 export async function syncStoreBilling(uid: string): Promise<StoreBilling> {
-  const state = storeBillingState(await subscriber(uid));
+  const state = storeBillingState(await subscriber(uid), Date.now(), env.revenuecatAllowSandbox());
   const { error } = await db().rpc('apply_store_billing', {
     uid,
     p_status: state.status,
diff --git a/supabase/migrations/20260916050144_serialize_reciprocal_invites.sql b/supabase/migrations/20260916050144_serialize_reciprocal_invites.sql
new file mode 100644
index 0000000..4aab6e3
--- /dev/null
+++ b/supabase/migrations/20260916050144_serialize_reciprocal_invites.sql
@@ -0,0 +1,49 @@
+-- Serialize both directions of a friendship before checking reciprocal redemption.
+-- PostgREST uses READ COMMITTED: the check after a waiting lock sees the committed invite.
+create or replace function public.redeem_invite_code(p_code text)
+returns text language plpgsql security definer set search_path = public as $$
+declare
+  uid    constant uuid := auth.uid();
+  clean  constant text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
+  code_owner uuid;
+  joined timestamptz;
+begin
+  if uid is null then
+    raise exception 'Not signed in';
+  end if;
+  if exists (select 1 from public.invite_codes where redeemed_by = uid) then
+    return 'already_redeemed';
+  end if;
+  select created_at into joined from auth.users where id = uid;
+  if joined < now() - interval '7 days' then
+    return 'too_late';
+  end if;
+  select owner_id into code_owner from public.invite_codes where code = clean;
+  if code_owner is null then
+    return 'not_found';
+  end if;
+  if code_owner = uid then
+    return 'own_code';
+  end if;
+  perform pg_advisory_xact_lock(hashtextextended(
+    'invite-pair:' || least(uid, code_owner)::text || ':' || greatest(uid, code_owner)::text, 0
+  ));
+  -- Both directions hold the same lock until redemption and any reward commit.
+  if exists (select 1 from public.invite_codes where owner_id = uid and redeemed_by = code_owner) then
+    return 'invited_you';
+  end if;
+  update public.invite_codes set redeemed_by = uid, redeemed_at = now()
+   where code = clean and redeemed_at is null;
+  if not found then
+    return 'used';
+  end if;
+  if public.grant_invite_reward(uid) then
+    return 'rewarded';
+  end if;
+  return 'pending';
+exception when unique_violation then
+  return 'already_redeemed';
+end; $$;
+
+revoke execute on function public.redeem_invite_code(text) from public, anon;
+grant execute on function public.redeem_invite_code(text) to authenticated;
```

## Phase 3: Automated QA Integration

`package.json` now exposes `npm run test:security`, which runs the new Deno billing tests
followed by the Node/PostgreSQL concurrency tests. The billing tests are also picked up by
the existing `test:functions` directory scan. No existing tests or CI configuration were changed.

| Test file | Original source | Patched source |
| --- | --- | --- |
| [security_store_test.ts](../supabase/functions/tests/security_store_test.ts), identical final file | 4 security assertions failed; 1 production control passed; TypeScript compilation passed | 5 tests passed |
| [security-invites.test.cjs](../scripts/security-invites.test.cjs), identical assertions with baseline migration mode | 2 security subtests failed; 2 controls passed | All 4 subtests passed |

Billing evidence: the baseline selected sandbox Studio and persisted an active paid plan.
The patch rejects it, keeps paid Solo authoritative, enforces the exact server opt-in value,
and preserves grace periods, cancellation and refunds. Synthetic RevenueCat and Supabase
transport responses exercise the actual `syncStoreBilling` mapper and RPC payload.
Network access is not granted to the Deno tests.

Database evidence: the baseline's reverse transaction returned `pending` and both users
received `10` bonus checks. The patch returns `invited_you` for the reverse transaction
and leaves both users at `5`. The test waits for an actual advisory lock wait or vulnerable
completion before releasing the first transaction; it does not rely on a timing-only sleep.
Normal invitations, code normalization, repeated redemption, authentication and RPC ACLs
are positive/negative controls.

The PostgreSQL fixture loads the real initial schema, moderation, billing, invite and
security-fix migrations with a minimal synthetic `auth` schema. It uses PostgreSQL 14.18,
private temporary storage and a private Unix socket with TCP disabled; inherited PG connection
settings are removed. The cluster is stopped and removed on completion. No linked Supabase
database or real accounts are used.

### Commands

Requirements: Node.js, the project's installed dependencies, Deno, and PostgreSQL 14+ tools
(`initdb`, `pg_ctl`, `psql`) on PATH. `PG_BIN` may name PostgreSQL's bin directory.

```sh
npm run test:security
npm run test:functions
npm run test:ui
npm run typecheck
```

This machine needs `/opt/homebrew/bin` on PATH and `PG_BIN=/opt/homebrew/bin`.
The sandbox denies PostgreSQL shared-memory allocation; the combined test passed with
approved local execution outside that sandbox. This environment error was not counted as
a reproduced vulnerability or a failing security assertion.

To reproduce the invite regression without editing application code:

```sh
SECURITY_INVITES_BASELINE=1 node --test scripts/security-invites.test.cjs
```

That command intentionally fails the same two security assertions by omitting only the new
migration. The billing baseline was run in an isolated copy with the original `store.ts`
and `env.ts`; the final test file was byte-identical between baseline and patched runs.

Additional checks: **49 backend tests passed**, **28 existing UI tests passed**,
**TypeScript check passed**, and **git diff --check passed**. The production patch artifact
also passed `git apply --check --reverse` against the patched worktree, without applying it.
The Node TAP summary counts the outer database test plus its four subtests as five tests;
the matrix reports the four substantive checks.

### Rollout

1. Deploy the updated Edge Function and apply the new migration through the normal release process.
2. Keep `REVENUECAT_ALLOW_SANDBOX` unset or `false` in production. Enable the literal `true`
   only on an isolated test backend; production receipts continue to take priority.
3. Resync affected subscribers after deployment so previously cached sandbox entitlements
   are recalculated. Existing referral credits are not retroactively removed by the migration.

The README documents the changed sandbox policy and the security test command.
All fixes are local and remain uncommitted; no deployment was performed.

## Review Lenses and Coverage

- **Red Team:** exercised no-charge sandbox entitlements and reciprocal redemption concurrency;
  examined user-controlled inputs, service-role sinks, webhook signatures and session checks.
- **Data Contract:** preserved billing response fields/product IDs, existing helper callers,
  invitation return values, ownership constraints and column/RPC grants.
- **Paranoid Engineering Lead:** retained existing user changes, used a forward migration,
  tested legitimate production purchases and invitations, and ran existing backend/UI tests.

In the inspected source, `requireUser` verifies tokens with `auth.getUser`; sensitive API
operations check ownership. Profile billing/trial/bonus columns have no authenticated update
grant, and internal billing/reward RPC execution is restricted. Parameterized database
operations and signed webhook verification were inspected. The comment classifier, moderation
rules/pipeline, polling and scheduling paths were also reviewed for trust/state transitions.
No additional supported high/critical finding was established in this assessed scope.

### Material Gaps

The installed [CSO skill](/Users/Mubi/.codex/skills/gstack-cso/SKILL.md) requires:
> After `start`, inspect source only with that run's `inspect`, `read`, and `history`.

Its fail-closed reader withheld several relevant inputs, including
`src/context/AuthContext.tsx`, `supabase/functions/api/connect.ts`,
`supabase/functions/api/instagram.ts`, `supabase/config.toml`,
`app/(tabs)/filters.tsx`, `app/paywall.tsx`, `src/components/ui.tsx`, and selected scripts.
Their static audit remains incomplete. Passing existing tests that import these modules
does not establish complete security coverage of those files.

The helper's bounded Git history collection failed its output limit. Full historical secret
coverage, dependency advisory/supply-chain scanning, native dependency memory-safety auditing,
and deployed configuration/provider behavior were not assessed. No live browser QA or real
provider purchase flow was run. AsyncStorage session persistence was noted as an at-rest
hardening opportunity, but no external exfiltration path was demonstrated, so it is not
counted as a supported vulnerability.

The separate helper-owned static audit is
[`1789534039984-c3d0c8b041ce103e`](/Users/Mubi/.gstack/security/cso/61eeb1488ae6c5f78dbec1d3/1789534039984-c3d0c8b041ce103e/report.md),
finished with **partial** coverage and two supported findings. The patch verification above
is ordinary local regression evidence, not a helper-attested runtime bundle or deployed
closure claim. No source, findings or tests were sent to shared gstack learning/telemetry.
