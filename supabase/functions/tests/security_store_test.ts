// QA attribution: GSTACK-SEC-01 /qa 2026-09-16.
// Report: artifacts/security-review-2026-09-16.md.
import { assertEquals } from '@std/assert';
import { storeBillingState, syncStoreBilling, type StoreSubscription } from '../api/store.ts';

const NOW = Date.UTC(2026, 8, 14);
const at = (days: number) => new Date(NOW + days * 86_400_000).toISOString();
const NONE = { status: 'none', plan: null, interval: null, periodEnd: null, cancelAtPeriodEnd: false } as const;
// Keep the regression executable against the original two-argument implementation as well.
const billingStateWithSandbox: (
  subscriptions: Record<string, StoreSubscription>, now?: number, allowSandbox?: boolean
) => ReturnType<typeof storeBillingState> = storeBillingState;

Deno.test('security: sandbox purchases cannot unlock a paid plan by default', () => {
  assertEquals(storeBillingState({
    toxoff_studio_monthly: { expires_date: at(30), is_sandbox: true },
  }, NOW), NONE);
});

Deno.test('security: a sandbox upgrade cannot replace a paid production plan', () => {
  const subscriptions = {
    toxoff_solo_monthly: { expires_date: at(30), is_sandbox: false },
    toxoff_studio_annual: { expires_date: at(365), is_sandbox: true },
  };
  assertEquals(storeBillingState(subscriptions, NOW), {
    status: 'active', plan: 'solo', interval: 'monthly', periodEnd: at(30), cancelAtPeriodEnd: false,
  });
});

Deno.test('security: production purchases retain grace, cancellation and refund behavior', () => {
  assertEquals(storeBillingState({
    toxoff_plus_annual: { expires_date: at(30), is_sandbox: false, unsubscribe_detected_at: at(-1) },
  }, NOW), {
    status: 'active', plan: 'plus', interval: 'annual', periodEnd: at(30), cancelAtPeriodEnd: true,
  });
  assertEquals(storeBillingState({
    toxoff_plus_monthly: {
      expires_date: at(-1), grace_period_expires_date: at(5),
      billing_issues_detected_at: at(-1), is_sandbox: false,
    },
  }, NOW).status, 'past_due');
  assertEquals(storeBillingState({
    toxoff_plus_monthly: { expires_date: at(30), refunded_at: at(-1), is_sandbox: false },
    toxoff_solo_monthly: { expires_date: at(-1), is_sandbox: false },
  }, NOW), NONE);
});

Deno.test('security: explicit sandbox testing keeps production purchases authoritative', () => {
  const subscriptions: Record<string, StoreSubscription> = {
    toxoff_studio_monthly: { expires_date: at(30), is_sandbox: true },
  };
  assertEquals(billingStateWithSandbox(subscriptions, NOW, true), {
    status: 'active', plan: 'studio', interval: 'monthly', periodEnd: at(30), cancelAtPeriodEnd: false,
  });
  subscriptions.toxoff_solo_annual = { expires_date: at(10), is_sandbox: false };
  assertEquals(billingStateWithSandbox(subscriptions, NOW, true).plan, 'solo');
  assertEquals(billingStateWithSandbox({
    toxoff_studio_monthly: { expires_date: at(30), is_sandbox: true, refunded_at: at(-1) },
    toxoff_plus_monthly: { expires_date: at(-1), is_sandbox: true },
  }, NOW, true), NONE);
});

Deno.test('security: store sync persists only entitlements allowed by server policy', async () => {
  const uid = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
  const expires = new Date(Date.now() + 86_400_000).toISOString();
  const settings: Record<string, string | undefined> = {
    SUPABASE_URL: 'https://billing-test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'unit-test-service-role-key',
    REVENUECAT_SECRET_KEY: 'unit-test-revenuecat-key',
    REVENUECAT_ALLOW_SANDBOX: undefined,
  };
  const previous = Object.fromEntries(Object.keys(settings).map((name) => [name, Deno.env.get(name)]));
  const originalFetch = globalThis.fetch;
  let subscriptions: Record<string, StoreSubscription> = {};
  const writes: Record<string, unknown>[] = [];
  try {
    for (const [name, value] of Object.entries(settings)) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname === 'api.revenuecat.com' && url.pathname === `/v1/subscribers/${uid}`) {
        assertEquals(new Headers(init?.headers).get('Authorization'), 'Bearer unit-test-revenuecat-key');
        return Response.json({ subscriber: { subscriptions } });
      }
      if (url.hostname === 'billing-test.supabase.co' && url.pathname === '/rest/v1/rpc/apply_store_billing') {
        assertEquals(init?.method, 'POST');
        writes.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected network request: ${url.origin}${url.pathname}`);
    };

    for (const setting of [undefined, 'false', '1', 'TRUE', 'true']) {
      if (setting === undefined) Deno.env.delete('REVENUECAT_ALLOW_SANDBOX');
      else Deno.env.set('REVENUECAT_ALLOW_SANDBOX', setting);
      subscriptions = { toxoff_studio_monthly: { expires_date: expires, is_sandbox: true } };
      const allowed = setting === 'true';
      const state = await syncStoreBilling(uid);
      assertEquals(state.status, allowed ? 'active' : 'none', `setting=${setting}`);
      assertEquals(writes.at(-1), {
        uid,
        p_status: allowed ? 'active' : 'none',
        p_plan: allowed ? 'studio' : null,
        p_interval: allowed ? 'monthly' : null,
        p_period_end: allowed ? expires : null,
        p_cancel_at_period_end: false,
      });
    }

    subscriptions.toxoff_solo_annual = { expires_date: expires, is_sandbox: false };
    const state = await syncStoreBilling(uid);
    assertEquals(state.plan, 'solo');
    assertEquals(writes.at(-1), {
      uid, p_status: 'active', p_plan: 'solo', p_interval: 'annual',
      p_period_end: expires, p_cancel_at_period_end: false,
    });
    assertEquals(writes.length, 6);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});
