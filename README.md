# toxoff

**Keep hate off your comments. Automatically.**

toxoff is a mobile app that connects to a creator's Instagram and/or TikTok accounts
and uses AI to automatically detect and remove toxic, hateful, or harmful comments in
any language. Creators sign up with email, Google, or Apple, get a 7-day Plus trial, then
stay on a Free tier unless they subscribe (location-based pricing).

Built with **Expo (React Native) + TypeScript**, **Supabase** (auth + database),
**Stripe** & **Safepay** (subscriptions), and **Expo Notifications** (push alerts).
Targets **iOS (App Store)** and **Android (Play Store)** from one codebase.

---

## Quick start

```bash
npm install
npm run gen:assets        # regenerate placeholder icons (optional)
cp .env.example .env      # fill in keys — or leave blank to run in DEMO MODE
npx expo start            # press i (iOS), a (Android), or scan in Expo Go
```

### Demo mode
With **no `.env` keys**, the app runs fully on **mock data** — no network calls. You can
walk the entire flow (signup → trial → connect accounts → dashboard → log → filters →
paywall → settings) immediately. Auth, the moderation feed, and checkout are all
simulated. Drop in real keys to go live.

---

## Project structure

```
app/                       # expo-router screens (file-based routing)
  _layout.tsx              # providers + root stack
  index.tsx                # auth redirect (→ splash or tabs)
  splash.tsx               # onboarding / splash
  (auth)/                  # login, signup, trial-started
  connect-accounts.tsx     # OAuth placeholder + account-limit gating
  paywall.tsx              # region-aware subscription screen
  (tabs)/                  # Home, Log, Filters, Settings (bottom tabs)
src/
  theme/                   # colors + light/dark ThemeContext
  context/                 # Auth, Moderation, Region providers
  data/                    # plans, pricing (region table), mock data
  lib/                     # supabase, billing, safepay, moderation, notifications, time
  components/              # Button, Card, Badge, LogRow, etc.
supabase/config.toml       # Supabase CLI config (auth settings, redirect URLs)
supabase/migrations/       # database schema: tables, RLS, triggers, plan limits
scripts/generate-assets.mjs# placeholder icon/splash generator
```

---

## Configuration

All client env vars are prefixed `EXPO_PUBLIC_` (see `.env.example`). **Secret keys
(Stripe/Safepay secret, OpenAI) never go in the app** — they live on your backend.

### Supabase (auth + data)
The hosted project is **toxoff** (ref `svkdtymwerqjzauvsnbf`, Singapore) and this repo is
linked to it with the Supabase CLI. The database password is in the macOS Keychain under
`supabase-toxoff-db`.

- **Schema changes:** add a new file in `supabase/migrations/`, then
  `npx supabase db push -p "$(security find-generic-password -s supabase-toxoff-db -w)"`.
- **Auth settings** live in `supabase/config.toml` (site URL `toxoff://`, redirect URLs,
  email confirmation, Apple). Always run `npx supabase config diff` before
  `npx supabase config push` — undeclared settings are left alone, declared ones overwrite
  the hosted project.
- **App keys:** `.env` holds the project URL and anon key (public). The service-role key
  never goes in the app.
- **Email confirmation is off** for development. Before launch, add a custom SMTP provider
  (e.g. Resend) — Supabase's built-in email only reaches your own team — and set
  `[auth.email] enable_confirmations = true`.
- **Google sign-in:** create a Web OAuth client in Google Cloud, then add it under
  `[auth.external.google]` (secret via `env(...)`, never committed) and push.
- **Sign in with Apple** (iOS only — required by App Store rule 4.8 because Google sign-in
  is offered) is enabled for `com.toxoff.app` and `host.exp.Exponent` (Expo Go). `app.json`
  sets `ios.usesAppleSignIn`, so EAS adds the capability to the App ID at build time.
- Upgrade the project to **Pro** before launch — free projects pause after a week idle.

### AI moderation
`src/lib/moderation.ts` holds the decision logic (sensitivity threshold + enabled
categories + keyword/blocked-user rules). Point `classifyComment` at your classifier
(OpenAI moderation API or a custom multilingual endpoint) via
`EXPO_PUBLIC_API_BASE_URL/moderate`. The same `decide()` function runs on mock and live
data.

### Instagram / TikTok
`app/connect-accounts.tsx` contains the OAuth flow placeholder. Swap the simulated
connect for the real consent screen (expo-web-browser) and store the returned tokens in
`public.accounts`.

---

## Billing (location-based)

Pricing and payment rails are chosen by the user's **region** (auto-detected via
`expo-localization`, overridable in Settings). Tiers and prices live in
[`src/data/plans.ts`](src/data/plans.ts) and [`src/data/pricing.ts`](src/data/pricing.ts).

| Tier | Accounts | Limits | Pakistan (PKR, Safepay) | Rest of world (USD, Stripe) |
|------|----------|--------|-------------------------|------------------------------|
| **Free** | 1 (IG *or* TikTok) | shares the 100 free comment checks; no keyword blocklist or blocked users | free | free |
| **Solo** | 1 (IG *or* TikTok) | unlimited; keyword blocklist | Rs 1,100/mo | $4/mo |
| **Plus** | up to 5 (IG + TikTok) | unlimited; keyword blocklist + blocked users | Rs 2,500/mo | $9/mo |

Every new account starts with a **7-day Plus trial** (no card) and moves to **Free** when it
ends unless they subscribe. The trial and Free together get **100 free comment checks per
account — ever, not per month**; once they're used, comments stop being checked until the
user subscribes. Paid plans bill **monthly or annually** (annual = 2 months free).
**Launch market: Pakistan.**

Limits live in `src/data/plans.ts` (app) and `supabase/migrations` (server) — keep them in
sync. The database enforces them itself: `enforce_account_limit` blocks extra accounts, and
the moderation backend must call `consume_comment_check(user_id)` before checking each
comment (it atomically spends one free check, and always allows paid plans). Paid-only
rules use `effective_plan()`. When a plan lapses, the oldest accounts within the new limit
keep being moderated.

### Payment providers
- **Pakistan → Safepay** (`src/lib/safepay.ts`): cards + **JazzCash** + **Easypaisa**.
  Stripe can't process PKR/local wallets, which is why PK routes here. Needs a backend
  route `POST /billing/safepay/session` that uses the Safepay **secret** key to create a
  checkout session and returns `{ checkoutUrl }`.
- **Rest of world → Stripe** (`src/lib/billing.ts`): PaymentSheet via
  `@stripe/stripe-react-native`. Needs `POST /billing/subscribe` to create the
  Customer + Subscription (with trial) server-side and return the PaymentSheet params.

`src/lib/billing.ts#startSubscription` routes to the right provider by
`region.provider`. To add a market, add an entry to `REGIONS` in `pricing.ts`.

---

## Push notifications

`src/lib/notifications.ts` registers an Expo push token and fires a local alert when a
comment is removed (`notifyCommentRemoved`). The Dashboard registers on mount; the
Settings toggle requests/relinquishes permission. For server-sent pushes, store the
token in `profiles.push_token` and send via the Expo Push API from your moderation
backend.

---

## Shipping to the App Store & Play Store

Config for both stores is already in `app.json` (bundle id / package
`com.toxoff.app`, New Architecture on) and `eas.json` (build + submit profiles).

```bash
npm i -g eas-cli
eas login
eas build:configure                 # creates/links the EAS project id

# Production builds
eas build --platform ios --profile production
eas build --platform android --profile production

# Submit
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

Before submitting, fill in `eas.json > submit.production`:
- **iOS**: `appleId`, `ascAppId` (App Store Connect app id), `appleTeamId`.
- **Android**: `serviceAccountKeyPath` (Play Console service-account JSON) and `track`.

Also replace the placeholder `extra.eas.projectId` in `app.json` (set automatically by
`eas build:configure`) and swap the generated `assets/` PNGs for real artwork.

> **Store review note:** Instagram/TikTok API access and removing comments require
> approved platform permissions and a public privacy policy. Have those ready before
> review.

---

## Scripts

| Command | What it does |
|---------|--------------|
| `npm start` | Start the Expo dev server |
| `npm run ios` / `android` | Open on a simulator/emulator |
| `npm run typecheck` | `tsc --noEmit` (strict mode) |
| `npm run lint` | Expo lint |
| `npm run gen:assets` | Regenerate placeholder icon/splash PNGs |
