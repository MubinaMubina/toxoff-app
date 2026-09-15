# toxoff

**Keep hate off your comments. Automatically.**

toxoff is a mobile app that connects to a creator's Instagram accounts
and uses AI to automatically detect and remove toxic, hateful, or harmful comments in
any language. Creators sign up with email, Google, or Apple, get a 7-day Plus trial, then
stay on a Free tier unless they subscribe in the app (Apple in-app purchase). TikTok is coming soon
and cannot currently be connected.

Built with **Expo (React Native) + TypeScript**, **Supabase** (auth + database),
**RevenueCat** (App Store subscriptions), and **Expo Notifications** (push alerts).
Launches on **iOS (App Store)**; the codebase can also build for Android later.

---

## Quick start

```bash
npm install
npm run gen:assets        # rebuild icon/splash from assets/toxoff-icon-green-1024.png (needs Pillow; optional)
cp .env.example .env      # fill in keys — or leave blank to run in DEMO MODE
npx expo start            # press i (iOS), a (Android), or scan in Expo Go
```

### Demo mode
With **no `.env` keys**, the app runs fully on **mock data** — no network calls. You can
walk the entire flow (signup → trial → onboarding → dashboard → log → filters →
paywall → settings) immediately. Auth, the moderation feed, and checkout are all
simulated. Password reset email is unavailable in demo mode. Drop in real keys to go live.

---

## Project structure

```
app/                       # expo-router screens (file-based routing)
  _layout.tsx              # providers + root stack
  index.tsx                # auth/recovery redirect (→ splash, onboarding, reset password or tabs)
  splash.tsx               # onboarding / splash
  (auth)/                  # login, signup, trial-started, forgot/reset password
  onboarding.tsx           # Connect → Protection → Ready
  connect-accounts.tsx     # Instagram OAuth + account-limit gating; TikTok coming soon
  paywall.tsx              # subscription screen (App Store prices, restore purchases)
  invite.tsx               # invite friends: share a code, or enter a friend's
  (tabs)/                  # Home, Log, Filters, Settings (bottom tabs)
src/
  theme/                   # colors + light/dark ThemeContext
  context/                 # Auth, Moderation providers
  data/                    # plans, list prices, mock data
  lib/                     # supabase, api, purchases (RevenueCat), invites, notifications, time
  components/              # Button, Card, Badge, LogRow, etc.
supabase/config.toml       # Supabase CLI config (auth settings, redirect URLs)
supabase/migrations/       # database schema: tables, RLS, triggers, plan limits, cron jobs
supabase/functions/api/    # backend: Instagram connect, comment webhooks, AI check, restores
supabase/functions/tests/  # backend unit tests (Deno)
scripts/generate-assets.py # icon, splash, favicon and notification icon from the master icon
```

---

## Configuration

All client env vars are prefixed `EXPO_PUBLIC_` (see `.env.example`). **Secret keys
(RevenueCat secret, OpenAI) never go in the app** — they live on your backend.

### Supabase (auth + data)
The hosted project is **toxoff** (ref `sjfmcieunormozrybqmi`, Singapore) and this repo is
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
- **Auth emails** go out from `toxoff <noreply@toxoff.app>` through Resend (`[auth.email.smtp]`,
  templates in `supabase/templates/`). The domain is verified in Resend with DNS records at
  Namecheap; the sending-only API key is in the Keychain (`supabase-toxoff-resend-api-key`).
  Any `config push` must have both `RESEND_API_KEY` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`
  in the environment (the comment above `[auth.email.smtp]` has the full command), or the push
  fails or blanks a secret.
- **Email confirmation is off** for development. Before launch set
  `[auth.email] enable_confirmations = true` and push.
- **Google sign-in:** set up. Web OAuth client in Google Cloud project *toxoff*, configured under
  `[auth.external.google]`. The secret isn't in git: it's in the Keychain (`supabase-toxoff-google-secret`),
  so push config with it in the environment, or the push would clear it:
  `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="$(security find-generic-password -s supabase-toxoff-google-secret -w)" npx supabase config push`
- **Sign in with Apple** (iOS only — required by App Store rule 4.8 because Google sign-in
  is offered) is enabled for `com.toxoff.app` and `host.exp.Exponent` (Expo Go). `app.json`
  sets `ios.usesAppleSignIn`, so EAS adds the capability to the App ID at build time.
- Upgrade the project to **Pro** before launch — free projects pause after a week idle.

### AI moderation
Comments are checked by the backend, not the app. `supabase/functions/api/classifier.ts` asks a
small GPT model (`OPENAI_MODEL`, default `gpt-5.4-nano`, about $0.05 per 1,000 comments, needs an
`OPENAI_API_KEY`) to score each comment in any language, including Roman Urdu, Hindi and mixed
scripts, and to name its language (saved as `moderation_log.language`). If the model fails, OpenAI's
free moderation endpoint (English-centric) is the fallback. A spam score from simple signals (links,
"DM me", phone numbers) is added either way.

Cheap answers come first, so the model only sees the comments that need it (`classify()`):
comments with nothing to read (emoji, @mentions, numbers) and obvious spam (two or more signals)
are settled by rules with no API call at all. Plain English comments, where every word is a common
one, go to the free moderation endpoint, and if it's confidently clean (every score under 10%) or
confidently abusive (90% or more) that's the answer. Everything else goes to the model: other
languages and scripts, any unknown word (names, slang, Roman Urdu), and the grey zone in between.
`Classification.source` says which path answered.
`moderation.ts` turns the scores into a decision with the user's sensitivity, categories, keyword
blocklist and blocked users (keywords match whole words). The spam category is **off by default**
(`filters.categories`); users turn it on during onboarding or in Filters. To move to another model or provider
(e.g. `gpt-5.4-mini` for sharper judgement, or Claude), change `OPENAI_MODEL` or replace
`classify()`; the rest only sees scores.

The classifier does one thing: it scores a comment's text, and the only action taken on the result
is removing that one comment. `filters.flagged_action` (Filters screen) decides how: **hide** is the
new setup default and hides every flagged comment so it can be restored; **auto** (shown as
"Delete clear abuse") permanently deletes toxicity scored at 80% or more and hides everything else,
including spam; **delete** permanently deletes every flagged comment, including spam
(`chooseAction()` in `moderation.ts`). Selecting either deletion mode requires confirmation in
Filters. Existing saved modes are preserved. Blocked users and keywords are rules, not AI scores,
so auto hides those. The log records which happened (`moderation_log.action`),
and Restore is refused for deleted ones. The app's Log has two sections: **Hidden** (readable,
restorable) and **Deleted**, where the words stay out of sight (a "Read it anyway" link shows
them) and the user is invited to **erase them forever, unread**, one or all at once.
`POST /comments/erase-deleted` wipes the text and author from those rows for good but keeps the
rows (`moderation_log.erased_at`), so Home's counts and the reason stats stay right; the app doesn't
show erased rows. Nothing else is ever done:
no replies, likes or anything outside comments. It's also **rate limited**:
each paid model call takes a slot from `take_classifier_call()`, by default 60 a minute per user
and 600 a minute for the whole app (comments settled by rules or the free endpoint don't take one). You can change these with the optional `CLASSIFIER_LIMIT_PER_USER` and
`CLASSIFIER_LIMIT_TOTAL` secrets. Over the limit, a comment isn't skipped: its free check is given
back and it's checked on Meta's next delivery or the next poll.

The prepared migration [`20260914234806_reversible_moderation_default.sql`](supabase/migrations/20260914234806_reversible_moderation_default.sql)
changes the database default to `hide` for new filter rows. It does not update existing rows or
reset their saved modes. **This local migration still needs deployment**; it has not been applied
to the hosted database as part of the design update.

### Instagram / TikTok
Instagram uses the Instagram API with Instagram Login (Business and Creator accounts). Connect
opens Instagram's consent screen through the backend, which keeps the token server-side
(`account_tokens`) and subscribes the account to comment webhooks. The app explains that toxoff
can read, hide and restore comments, and permanently delete them if deletion is enabled. It does
not publish posts or access DMs. TikTok is shown as "Coming soon" with no connection action;
current plan limits apply to Instagram accounts.

---

## Moderation backend

One Supabase Edge Function, `supabase/functions/api`, deployed at
`https://sjfmcieunormozrybqmi.supabase.co/functions/v1/api` (the app's `EXPO_PUBLIC_API_BASE_URL`).

| Route | Called by | Does |
|-------|-----------|------|
| `POST /connect/start` | app | returns Instagram's consent URL |
| `GET /connect/instagram/callback` | Instagram | swaps the code for a 60-day token; hands it back to the app sealed |
| `POST /connect/finish` | app | links the account to the signed-in user (plan limit applies) |
| `POST /comments/restore` | app | un-hides the comment on Instagram, marks the log row restored |
| `POST /account/delete` | app | Settings → "Delete my account": deletes the auth user (cascades to every table) and the RevenueCat subscriber; body must be `{ "confirm": true }` |
| `GET`/`POST /webhooks/instagram` | Meta | webhook check / new comments: check, hide, log, push |
| `POST /cron/refresh-tokens` | daily job | extends Instagram tokens before they expire |
| `POST /cron/poll-comments` | 5-minute job | fetches new comments itself (see [Comment polling](#comment-polling)) |
| `POST /billing/…`, `POST /webhooks/stripe` | app, Stripe | subscriptions (see [Stripe](#stripe) below) |

For each comment, `pipeline.ts` skips paused, disconnected and over-the-limit accounts (the oldest
accounts within the plan are moderated). It then takes the comment on once with `claim_comment()`,
which spends a free check; repeat deliveries are free. Then it runs the classifier, hides the
comment, logs it and sends the push. If something fails temporarily (OpenAI or Instagram down),
the check is given back and the webhook returns an error, so Meta delivers the comment again.

**Secrets** (`npx supabase secrets set`, never in the app):
- `CONNECT_SECRET`, `CRON_SECRET`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` are set. The verify token is
  also in the Keychain (`supabase-toxoff-ig-verify-token`) for Meta's dashboard.
- `INSTAGRAM_POLLING=on` turns on [comment polling](#comment-polling).
- To add: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`. Until they exist, those routes answer 503 "missing … setting".
- Optional: `META_APP_SECRET`, if webhook deliveries fail with "Invalid signature".

**Deploy:** `npx supabase functions deploy api --use-api` (bundles on Supabase's servers, no Docker
needed). `verify_jwt` is off in `config.toml` because Meta can't send a Supabase token; the app
routes check the user's session themselves.

**Scheduled jobs** (pg_cron, created by the migrations):
- `refresh-instagram-tokens` runs daily at 04:00 UTC. It reads the function URL and `CRON_SECRET`
  from Vault (`api_url`, `cron_secret`).
- `prune-comment-claims` clears old claim records daily.
- `poll-instagram-comments` fires every 30 seconds (same Vault secrets); each account is read when due, see below.

### Comment polling
Meta only sends `comments` webhooks to apps that are **Live** and have **Advanced Access** (App
Review plus Business Verification). Until then, `poll.ts` fetches new comments itself, every 30
seconds while an account has a post younger than 2 hours and every minute otherwise, while
`INSTAGRAM_POLLING=on`:
- For each account that is due it reads the newest 5 posts and their first 50 comments and
  replies in ONE Instagram request (more pages only when a post needs them), newer
  than the account's `comments_polled_at` cursor (with 2 minutes of overlap, and never more than
  2 days back).
- Each comment goes through the same pipeline as a webhook, so the same rules apply: one free
  check, claims, hide, log, push, plan limits.
- Comments already hidden, and the account's own comments, are skipped.
- The cursor only moves when every comment was handled, so a temporary failure is read again
  next time. Meta allows about 200 calls per account per hour; when it says "too many", the
  account is left alone for 15 minutes (`poll_backoff_until`). `latest_post_at` drives the pace.
- Because it never looks back further than the 7 days claims are kept, a restored comment isn't
  hidden again.
- It doesn't cover comments on older posts. Webhooks do, so switch polling off (or keep it as a
  safety net) once Meta approves the app.

**Tests:** `npm run test:functions` (needs Deno), or with Docker:
`docker run --rm -v "$PWD":/app -w /app denoland/deno deno test --allow-env --config supabase/functions/api/deno.json supabase/functions/tests`.

**Meta app** (needed before real accounts can connect):
1. At developers.facebook.com, create a Business app with the Instagram use case.
2. Instagram → API setup with Instagram login: put the Instagram app ID and secret in the secrets above.
3. Business login settings → OAuth redirect URI:
   `https://sjfmcieunormozrybqmi.supabase.co/functions/v1/api/connect/instagram/callback`
4. Webhooks: set the callback URL to
   `https://sjfmcieunormozrybqmi.supabase.co/functions/v1/api/webhooks/instagram`, use the
   verify token from the Keychain, and subscribe to `comments`.
5. App roles → Roles → Instagram testers: add your own Instagram professional account, then
   accept the invite on instagram.com (Settings → Apps and websites → Tester invites). It can
   connect straight away. Its comments are picked up by [comment polling](#comment-polling).
6. Webhook deliveries of comments need the app to be **Live** (which needs a privacy-policy URL) and
   **Advanced Access** for `instagram_business_manage_comments`, which needs App Review and
   Business Verification. The Instagram account must also be public. Other creators can only
   connect after App Review approves `instagram_business_basic` and
   `instagram_business_manage_comments`.

---

## Billing (App Store)

toxoff launches on the **App Store only**, so subscriptions are sold with **Apple's in-app
purchase** (App Review rule 3.1.1), through **RevenueCat**. Tiers live in
[`src/data/plans.ts`](src/data/plans.ts). Prices are set per country in App Store Connect, and the
paywall shows Apple's price in the user's own currency. [`src/data/pricing.ts`](src/data/pricing.ts)
only holds the USD list prices shown in Expo Go and demo mode.

| Tier | Accounts | Limits | List price |
|------|----------|--------|------------|
| **Free** | 1 Instagram | shares the 20 free comment checks (+5 per invited friend, up to 3); no keyword blocklist or blocked users | free |
| **Solo** | 1 Instagram | unlimited; keyword blocklist | $6.99/mo, $49.99/yr |
| **Plus** | up to 5 Instagram | unlimited; keyword blocklist + blocked users | $12.99/mo, $99.99/yr |
| **Studio** | up to 15 Instagram | as Plus, for managers and small agencies | $29.99/mo, $249.99/yr |

The paywall uses compact plan choices centered on account limits and price, lists shared paid
benefits once, and repeats the selected plan and billed amount beside the purchase button.
Annual pricing leads with the full yearly charge; the monthly equivalent is secondary. Purchase
controls move into the scroll area on small screens or at larger text sizes.

Yearly is priced well under twelve months (save 40% on Solo, 36% on Plus, 31% on Studio): the
discount sells annual on the paywall, and annual users can't churn for a year. Studio also anchors
Plus as the sensible middle choice. For Pakistan and India set lower custom storefront prices in
App Store Connect rather than lowering the global price.

Every new account starts with a **7-day Plus trial** (no card; the app runs it, not Apple) and moves
to **Free** when it ends unless they subscribe. Subscribing during the trial starts the paid plan
straight away. The trial and Free together get **20 free comment checks per account, ever, not
per month**. Once they're used, comments stop being checked until the user subscribes or invites
a friend. **Launch market: Pakistan.** Apple Pay isn't available there, but App Store purchases
don't need it: Apple charges the card (or balance) on the user's Apple ID.

**Invites** (`app/invite.tsx`, migration `20260914020000_invites.sql`):
- Everyone has a single-use invite code: Settings → Invite friends, or the dashboard when the
  free checks run out.
- A new account (under 7 days old) can enter one friend's code. When that friend connects an
  Instagram account that no toxoff user has connected before, both get **5 more free checks**
  (`bonus_comment_checks`).
- Each person can earn this for up to **3 friends** (15 extra). A friend who joins after that
  still gets their 5.
- Anti-abuse:
  - `platform_accounts_seen` keeps a hash of every account ever connected, so re-linking one
    from a second email earns nothing.
  - Two people can't swap codes.
  - All writes go through `invite_status()` / `redeem_invite_code()` and an `accounts` trigger;
    the app can't write the tables.

Limits live in `src/data/plans.ts` (app) and `supabase/migrations` (server) — keep them in
sync. The database enforces them itself: `enforce_account_limit` blocks extra accounts, and
the moderation backend takes each comment on with `claim_comment()`, which atomically spends
one free check unless `is_paying()`. Paid-only rules use `effective_plan()`. When a plan lapses,
the oldest accounts within the new limit keep being moderated.

### App Store subscriptions (RevenueCat)

RevenueCat checks Apple's receipts and is the source of truth. The app signs RevenueCat in with the
toxoff user id (`src/lib/purchases.ts`), so every purchase belongs to that user. The backend
(`supabase/functions/api/store.ts`) re-reads the user from RevenueCat's REST API and copies their
subscription onto the profile (`billing_*` columns, `billing_store = 'app_store'`, via
`apply_store_billing()`). It does this on every webhook, and right after a purchase or restore. The
app only reads it, live.

| Route | Does |
|-------|------|
| `POST /billing/app-store/sync` | the app, after a purchase or restore: re-read and copy |
| `POST /webhooks/revenuecat` | any RevenueCat event: re-read every toxoff user it names (including both sides of a transfer) |

How it behaves:
- **Buying** during the trial or on Free starts the plan now.
- **Switching** between Solo, Plus and Studio, or monthly and annual, is another purchase in the
  same subscription group. Apple upgrades right away and downgrades at the next renewal.
- **Cancelling, changing the card and refunds** happen in Apple's own settings. The app's
  "Manage subscription" opens them.
- **Cancelled** (`unsubscribe_detected_at`): the plan stays on until the period ends.
- **Billing problem**: during Apple's grace period the plan stays on as `past_due`, and Settings
  says to update the payment method.
- **Refunded or expired**: back to the rest of the trial, if any, else Free.
- **Restore purchases** is on the paywall (required by the App Store).
- In **Expo Go**, or without a RevenueCat key, purchases run in demo mode (a local pretend plan).

**To set up** (with an Apple Developer account):
1. App Store Connect:
   - Create the app (`com.toxoff.app`) and sign the Paid Apps agreement (Business).
   - Add a subscription group `toxoff` with six auto-renewable subscriptions:
     `toxoff_solo_monthly`, `toxoff_solo_annual`, `toxoff_plus_monthly`, `toxoff_plus_annual`,
     `toxoff_studio_monthly` and `toxoff_studio_annual`.
   - Rank Studio above Plus above Solo in the group.
   - Set prices (the list prices above), with custom storefront prices for Pakistan and India.
2. App Store Connect → Users and Access → Integrations → In-App Purchase: create a key, for
   RevenueCat.
3. RevenueCat:
   - Create a project and add the App Store app, with the bundle id and that key.
   - Import the six products, and put them in the **current offering** as six packages (for
     example `solo_monthly`). The app finds packages by product id.
4. RevenueCat → Integrations → Webhooks:
   - URL: `https://sjfmcieunormozrybqmi.supabase.co/functions/v1/api/webhooks/revenuecat`
   - Authorization header: the value in the Keychain `supabase-toxoff-revenuecat-webhook-auth`
     (already set on the server as `REVENUECAT_WEBHOOK_AUTH`).
   - Send both sandbox and production events.
5. Keys:
   - RevenueCat's **Apple public key** (`appl_…`) goes in `.env` as `EXPO_PUBLIC_REVENUECAT_IOS_KEY`.
   - Its **secret key** goes on the server:
     `npx supabase secrets set REVENUECAT_SECRET_KEY=sk_…` (keep a copy in the Keychain as
     `supabase-toxoff-revenuecat-secret`).
6. Test with a development build (`eas build --profile development --platform ios`) and a
   sandbox tester from App Store Connect. Expo Go can't make real purchases.

### Stripe (not used by the iOS app)

The iOS app doesn't use Stripe or Safepay: App Store rules require Apple's in-app purchase, so their
app code was removed. The Stripe backend below is kept, tested and deployed, but switched off. It's
there in case toxoff also sells on the web or Android later.


Stripe is the source of truth. The backend (`supabase/functions/api/billing.ts`) copies the
user's current subscription onto their profile (`billing_*` columns, via `apply_billing()`)
after every action and on every webhook, always re-reading it from Stripe, so late or
out-of-order webhooks can't leave an old state behind. The app only reads it, live, through
Realtime.

| Route | Does |
|-------|------|
| `POST /billing/subscribe` `{ planId, interval }` | new subscription → returns what the payment sheet needs; an existing one → switches price or takes a cancellation back |
| `POST /billing/sync` | re-reads the subscription (the app calls it when the payment sheet closes) |
| `POST /billing/cancel` | ends it after the paid period (right away if chosen during the trial) |
| `POST /billing/portal` `{ returnUrl }` | Stripe's page for the card on file and invoices |
| `GET /billing/return` | sends the browser from that page back to the app |
| `POST /webhooks/stripe` | `customer.subscription.*` and `setup_intent.succeeded` |

How it behaves:
- **During the trial**, choosing a plan saves a card and sets the first charge for the moment
  the trial ends; the Plus trial carries on until then and comments stop counting against the
  free checks. If Stripe hasn't reported that first charge yet, the chosen plan holds for up
  to 3 days instead of dropping to Free.
- **After the trial**, the first period is paid in the payment sheet.
- **Switching plans** charges or credits the difference right away. If the bank declines, the
  plan stays as it was.
- **A failed renewal** (`past_due`) keeps the plan on while Stripe retries, and Settings asks for a
  new card. When the retries run out, the subscription ends and the user is on Free.
- **Cancelling** keeps the plan until the end of the paid period; choosing it again takes the
  cancellation back.
- **One card per user**, kept on the Stripe customer. Renewals and the first charge after a
  trial go to it, and Stripe's billing page changes it. (Stripe first keeps the card on the
  subscription itself, where it would win over a card changed on that page, so `cardOnFile()`
  moves it.)

The Stripe API version is pinned in `stripe.ts` (`2025-03-31.basil`).

**To set up** (with a Stripe account):
1. Products → create Solo and Plus, each with a monthly and a yearly USD price. Give the prices
   the lookup keys `toxoff_solo_monthly`, `toxoff_solo_annual`, `toxoff_plus_monthly` and
   `toxoff_plus_annual`. The backend finds prices by these keys; the app never names a price.
2. Developers → Webhooks → add the endpoint
   `https://sjfmcieunormozrybqmi.supabase.co/functions/v1/api/webhooks/stripe` with the events
   `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed` and
   `setup_intent.succeeded`.
3. Settings → Billing → Customer portal: allow updating the payment method and viewing invoices,
   and save. Leave plan switching off: the app does that (and the portal would end a trial early).
4. `npx supabase secrets set STRIPE_SECRET_KEY=sk_… STRIPE_WEBHOOK_SECRET=whsec_…`, and put
   the publishable key in `.env` as `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
5. Test with card `4242 4242 4242 4242` (any future date and CVC); `4000 0025 0000 3155`
   asks for bank confirmation (3-D Secure).

For the store build (can't be tried in Expo Go):
- Apple Pay and Google Pay need a development build with the merchant ID (`app.json`), an Apple
  Pay certificate in Stripe, and the `applePay` / `googlePay` options in `initPaymentSheet`
  (recurring Apple Pay also wants a recurring cart item).
- Banks that confirm payments on a web page need `urlScheme` on `StripeProvider` and `returnURL`
  in `initPaymentSheet`, with the return link handled so the router doesn't open it as a screen.
- A bank that asks to confirm every payment can't switch plans yet (the switch is refused rather
  than left waiting). Stripe's `pending_if_incomplete` plus a confirmation step in the app would
  fix that.


---

## Website (toxoff.app)

`docs/` is the static site: home, `privacy.html`, `terms.html`, `support.html`,
`delete-account.html`, a 404 page, `style.css` (the app's palette) and the icon files. The legal
texts also live as plain text in `legal/`; keep the two in step. The app links to these pages
(`src/lib/links.ts`), and so should the Meta app dashboard, App Store Connect and the Google
sign-in consent screen. It is hosted on GitHub Pages from a separate public repo (this one is
private), with `docs/CNAME` naming the custom domain; DNS for the domain is at Namecheap.

## Loading and offline states

`ModerationContext.status` is `loading` until the first fetch of accounts, filters, log and
profile completes, `ready` after, and `offline` if it failed (any error; usually no connection).
Home shows a protection check while loading and a status-unavailable message with refresh when
offline. Log and Settings show skeleton placeholders (`src/components/Skeleton.tsx`) while loading,
and keep showing them under an `OfflineBanner` (with Retry, which calls `reload()`) if the load
failed before anything arrived. Data that did arrive stays on screen through a failed retry.

## Onboarding

After sign-up (`trial-started`), `app/onboarding.tsx` has three steps:

1. **Connect:** connect Instagram, or choose "Connect later." First setup saves reversible hiding
   before opening Instagram because moderation can begin as soon as an account is connected.
2. **Protection:** choose Gentle, Balanced (recommended), or Strict sensitivity, with an optional
   spam toggle. The screen describes behavior without showing abusive example comments.
3. **Ready:** review the account and settings, then finish on Home. Skipped connection is clearly
   shown as not connected; it does not imply protection is running.

`ModerationContext.applyOnboarding` saves the choices and `profiles.onboarded_at` records completion.
Existing categories, keywords and preferences are retained unless changed; rerunning completed
setup also preserves the saved handling mode. Keywords and categories remain in Filters. Log
visibility, automatic erasure of deleted comments, and notification preferences remain under
"Peace of mind" in Settings. Onboarding does not request notification permission or overwrite an
existing push token. Unfinished setup is shown again at the next login.

## Home and protection status

Home leads with account coverage and the next action when accounts are disconnected, paused,
outside the plan limit, out of free checks, or unavailable offline. "Status updated" is the last
successful app refresh, not a claim about the last Instagram comment scan. A single activity
summary switches between the last 24 hours, 7 days and 30 days. Recent activity shows actions and
reasons without comment text; users open the Log to review comments according to their visibility preference.
Usage and trial details sit below protection and activity.

## Password recovery

"Forgot password?" opens `app/(auth)/forgot-password.tsx`. It requests a Supabase recovery email
with the native callback `toxoff://reset-password`, provides a resend cooldown, and asks users to
open the newest link in the same installed app that requested it (PKCE requires its stored verifier).
The reset screen accepts a verified recovery session, checks the new password and confirmation,
then asks the user to log in again. Invalid links offer a fresh request. An unfinished recovery
session is kept out of the normal app flow, including after a restart.

Local tests cover callback validation, recovery-session checks, startup gating and retryable
verification errors: `node --test scripts/password-recovery.test.cjs scripts/auth-recovery.test.cjs`.
Hosted email delivery and a real password change have **not** been verified in this design update.
Before release, verify the callback in the hosted Supabase redirect allowlist, configure email
delivery, and exercise the full flow in a native build that handles the `toxoff` URL scheme.

## Push notifications

When the backend hides a comment, it sends an Expo push to `profiles.push_token` if notifications
are on. The push says who wrote the comment and why it was hidden, but leaves the comment text out
on purpose. Settings requests permission and registers the token through `src/lib/notifications.ts`
when the user enables alerts; onboarding and Home do not prompt automatically. Settings offers a
push per comment, a daily summary at 9am Pakistan time (`POST /cron/daily-summary`), or none.
Tokens need a real EAS project id: `eas init`
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
`eas build:configure`). The store assets in `assets/` (icon, adaptive icon, splash, favicon,
notification icon) are built from the master icon `assets/toxoff-icon-green-1024.png` by
`npm run gen:assets`; to change the icon, replace that file and re-run it. The app's colours
(`src/theme/colors.ts`) follow the icon: deep forest green `#13433B` is the brand colour (splash
background, notification tint), with a mid green as the light-mode primary and a mint as the
dark-mode primary so buttons and links keep their contrast.

> **Store review note:** Instagram API access and removing comments require
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
