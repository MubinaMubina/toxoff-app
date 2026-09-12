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
  lib/                     # supabase, api, billing, safepay, notifications, time
  components/              # Button, Card, Badge, LogRow, etc.
supabase/config.toml       # Supabase CLI config (auth settings, redirect URLs)
supabase/migrations/       # database schema: tables, RLS, triggers, plan limits, cron jobs
supabase/functions/api/    # backend: Instagram connect, comment webhooks, AI check, restores
supabase/functions/tests/  # backend unit tests (Deno)
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
Comments are checked by the backend, not the app. `supabase/functions/api/classifier.ts` calls
OpenAI's moderation endpoint (free, needs an `OPENAI_API_KEY`) and adds a spam score from simple
signals (links, "DM me", phone numbers), since OpenAI doesn't detect spam or language.
`moderation.ts` turns the scores into a decision with the user's sensitivity, categories, keyword
blocklist and blocked users (keywords match whole words). To move to a paid classifier later
(e.g. Claude Haiku, for Roman Urdu and context), replace `classify()`; the rest only sees scores.

### Instagram / TikTok
Instagram uses the Instagram API with Instagram Login (Business and Creator accounts). Connect
opens Instagram's consent screen through the backend, which keeps the token server-side
(`account_tokens`) and subscribes the account to comment webhooks. Toxic comments are **hidden**,
not deleted, so Restore can bring them back. TikTok isn't built yet (connect answers "coming soon").

---

## Moderation backend

One Supabase Edge Function, `supabase/functions/api`, deployed at
`https://svkdtymwerqjzauvsnbf.supabase.co/functions/v1/api` (the app's `EXPO_PUBLIC_API_BASE_URL`).

| Route | Called by | Does |
|-------|-----------|------|
| `POST /connect/start` | app | returns Instagram's consent URL |
| `GET /connect/instagram/callback` | Instagram | swaps the code for a 60-day token; hands it back to the app sealed |
| `POST /connect/finish` | app | links the account to the signed-in user (plan limit applies) |
| `POST /comments/restore` | app | un-hides the comment on Instagram, marks the log row restored |
| `GET`/`POST /webhooks/instagram` | Meta | webhook check / new comments: check, hide, log, push |
| `POST /cron/refresh-tokens` | daily job | extends Instagram tokens before they expire |

For each comment, `pipeline.ts` skips paused, disconnected and over-the-limit accounts (the oldest
accounts within the plan are moderated). It then takes the comment on once with `claim_comment()`,
which spends a free check; repeat deliveries are free. Then it runs the classifier, hides the
comment, logs it and sends the push. If something fails temporarily (OpenAI or Instagram down),
the check is given back and the webhook returns an error, so Meta delivers the comment again.

**Secrets** (`npx supabase secrets set`, never in the app):
- `CONNECT_SECRET`, `CRON_SECRET`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` are set. The verify token is
  also in the Keychain (`supabase-toxoff-ig-verify-token`) for Meta's dashboard.
- To add: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `OPENAI_API_KEY`. Until they exist, those
  routes answer 503 "missing … setting".
- Optional: `META_APP_SECRET`, if webhook deliveries fail with "Invalid signature".

**Deploy:** `npx supabase functions deploy api --use-api` (bundles on Supabase's servers, no Docker
needed). `verify_jwt` is off in `config.toml` because Meta can't send a Supabase token; the app
routes check the user's session themselves.

**Scheduled jobs** (pg_cron, created by the migrations):
- `refresh-instagram-tokens` runs daily at 04:00 UTC. It reads the function URL and `CRON_SECRET`
  from Vault (`api_url`, `cron_secret`).
- `prune-comment-claims` clears old claim records daily.

**Tests:** `npm run test:functions` (needs Deno), or with Docker:
`docker run --rm -v "$PWD":/app -w /app denoland/deno deno test --config supabase/functions/api/deno.json supabase/functions/tests`.

**Meta app** (needed before real accounts can connect):
1. At developers.facebook.com, create a Business app with the Instagram use case.
2. Instagram → API setup with Instagram login: put the Instagram app ID and secret in the secrets above.
3. Business login settings → OAuth redirect URI:
   `https://svkdtymwerqjzauvsnbf.supabase.co/functions/v1/api/connect/instagram/callback`
4. Webhooks: set the callback URL to
   `https://svkdtymwerqjzauvsnbf.supabase.co/functions/v1/api/webhooks/instagram`, use the
   verify token from the Keychain, and subscribe to `comments`.
5. Add your own Instagram professional account as a tester to try it. Other creators can only
   connect after App Review approves `instagram_business_basic` and
   `instagram_business_manage_comments`.

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

When the backend hides a comment, it sends an Expo push to `profiles.push_token` if notifications
are on. The push says who wrote the comment and why it was hidden, but leaves the comment text out
on purpose. `src/lib/notifications.ts` registers the token: the Dashboard does it on mount, and the
Settings toggle requests or gives up permission. Tokens need a real EAS project id: `eas init`
replaces the placeholder `extra.eas.projectId` in `app.json`.

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
| `npm run test:functions` | Backend unit tests (needs Deno) |
| `npm run lint` | Expo lint |
| `npm run gen:assets` | Regenerate placeholder icon/splash PNGs |
