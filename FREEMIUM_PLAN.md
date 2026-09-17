# toxoff: freemium with ads (replacing the 7-day trial)

Written 16 September 2026 as an outline; **built the same day** with the numbers you chose:
50 checks a month, +5 per rewarded ad, 2 ads a day, a 7-day log on Free, banners on Home and Log,
no interstitials. The migration is on the hosted database and the backend is deployed. What's
left needs your accounts (AdMob, Apple, Expo) and is listed in PROGRESS.md. The rest of this file
is the outline as agreed, kept for the reasoning.

## The goal

- No trial. Everyone starts on a permanent **Free** plan and stays there until they subscribe.
- Free is useful forever but limited, and it shows ads. Paid plans remove the limits and the ads.
- Ads run through **RevenueCat Ads** so toxoff qualifies for the RevenueCat Shipaton 2026
  (and its "Catvertising" award for ads-based monetisation).

## Two facts that shape the design

**1. RevenueCat does not serve ads.** "RevenueCat Ads" is a layer on top of a normal ad SDK.
Google AdMob is the only network it supports directly; others work through manual event calls.
RevenueCat records each ad load, impression, click and the revenue Google reports, shows them
next to subscription revenue in its dashboard, and can grant a RevenueCat entitlement when a
user finishes a rewarded ad (Google confirms the view to RevenueCat server-to-server). The
feature is in beta and marked experimental. In React Native it's available from
react-native-purchases 10.2 (we're on 10.9), through `Purchases.adTracker`; the rewarded-ad
entitlement flow needs manual token handling in React Native, whereas iOS and Android get a
helper. Sources: RevenueCat's Ad Monetization docs (overview, AdMob, manual integration) and its
"monetizing without a paywall using ads" post.

**2. The Shipaton clock.** Rules: the app's **first public release on the App Store must
happen between 1 August and 30 September 2026, 11:45 PM Pacific**, and it must use the
RevenueCat SDK for a purchase or to serve ads through RevenueCat Ads. Judges must be able to
download it. TestFlight does not count. That is 14 days from today, and we still need the
Apple Developer account, an Expo account, a RevenueCat account, an AdMob account and an App
Store review (usually 1 to 3 days, sometimes longer). The Apple enrolment and the AdMob
account should be started today; everything else can proceed in parallel. Because ads on a
brand-new AdMob app are limited until Google links it to the live store listing, launch-week ads
may be sparse or test-only. That is normal and doesn't affect eligibility.

## What Free looks like (proposed defaults, yours to change)

Duolingo's model is: a real free product, a renewable allowance ("hearts"), ads between uses,
"watch an ad" to refill, and a subscription that removes both the limit and the ads.

| | Free | Solo | Plus | Studio |
|---|---|---|---|---|
| Connected accounts | 1 | 1 | 5 | 15 |
| Comment checks | **50 per month**, resets on the signup day each month | unlimited | unlimited | unlimited |
| Extra checks | +5 per rewarded ad, up to 2 ads a day; +5 per invited friend (up to 3) | | | |
| Keyword blocklist | no | yes | yes | yes |
| Blocked users | no | no | yes | yes |
| Log history | last 7 days | full | full | full |
| Ads | banner on Home and Log; rewarded ads when checks run low | none | none | none |

Kept on Free because it's the product's whole value: AI filtering, Auto hide-or-delete,
push notifications, the daily summary, Restore. No interstitial ads anywhere: toxoff is a
utility people open briefly, and full-screen ads in a mental-health product would be the
"experience users hate" the award explicitly penalises.

Earlier this week you leaned towards **100 checks for life** instead of a monthly allowance.
Either fits this plan; the counter just doesn't reset. My recommendation is monthly: a lifetime
cap is a trial in disguise, and a permanent free tier needs ads to have a permanent job.

## 1. Backend: user schema and rules

All in Supabase, one new migration plus small function rewrites.

**Remove the trial**
- `profiles.trial_ends_at` dropped; `sub_status` loses the `trialing` value (only `active` or
  `none`).
- `handle_new_user()` creates the profile with no plan and `sub_status = 'none'`; it no longer
  sets a 7-day trial.
- `effective_plan()` loses its trial branch: paid subscription or scheduled-cancel grace, else
  `free`.
- `apply_store_billing()` loses its "fall back to the remaining trial" branches. When a
  subscription lapses the user simply becomes Free.
- Existing trial rows (only test accounts and your own) are converted to Free by the migration.

**Renewable allowance instead of a lifetime counter**
- `profiles.free_comments_used` stays but becomes "used this period", plus a new
  `free_period_start timestamptz`. `consume_comment_check()` resets the counter when 30 days have
  passed since `free_period_start`, then applies the same rule as today. Paying users skip it.
- `profiles.bonus_comment_checks` becomes a separate pool that never resets, drawn from only
  after the monthly allowance is spent. Invites and rewarded ads both top it up.
- `plan_limits` gets two new columns so the app and the server read the same numbers:
  `monthly_checks` (30 for free, null for unlimited) and `log_history_days` (7 for free, null).
  Today the "must match" constants live in comments in `src/data/plans.ts`; this moves them into
  one row the app can also read, ending the drift risk.

**Ad rewards (the part that must be tamper-proof)**
- New table `ad_rewards (id, user_id, provider, transaction_id unique, ad_unit, checks_granted,
  created_at)`. Service-role only.
- New function `grant_ad_reward(uid, transaction_id, ad_unit)`: refuses duplicates (same
  transaction id), refuses more than 4 grants per user per rolling 24 hours, refuses paying
  users, then adds 5 to `bonus_comment_checks`. The amount is a server constant, never taken
  from the request.
- Grants are triggered **only by Google's server-side verification callback**, never by the
  app saying "I watched an ad". The app can't be trusted for this; a jailbroken phone or a
  proxy could otherwise mint unlimited checks.

**Log history limit on Free**
- A `log_visible_since(uid)` function; the Log query uses it. Rows older than 7 days are
  filtered out for Free users but kept, so upgrading brings them back, and the counts on Home
  stay right.

## 2. Backend: new endpoints (Edge Function `api`)

- `POST /webhooks/admob-ssv`: AdMob's rewarded-ad server-side verification callback. Verifies
  Google's ECDSA signature against Google's published verifier keys (cached, refreshed daily),
  reads our `custom_data` (the toxoff user id plus a random nonce the app generated), and calls
  `grant_ad_reward`. Replays are harmless because of the unique transaction id. Google sends
  these for test ads too, so it can be exercised before launch.
- `GET /me` (or the existing profile read) returns the new fields: checks used this period,
  period end, bonus pool, rewarded ads left today, and `ads_enabled` (true when not paying).
- RevenueCat webhook: no change. Subscriptions still map from product ids as today.

## 3. Frontend: gating

**Delete**
- `app/(auth)/trial-started.tsx` and its route; social sign-in and email signup go straight to
  onboarding.
- `TRIAL_DAYS`, `demoTrial()`, the `trialing` status in `Subscription`, the trial badge in
  Settings, the trial line on Home, and every "free trial" string (splash CTA and footer, signup
  confirmation, paywall subtitle, banner and fine print, README).

**Change**
- `Subscription.status` becomes `'active' | 'free'`. `AuthContext.toSubscription()` mirrors
  the simplified `effective_plan()`.
- `src/data/plans.ts`: `FREE_COMMENT_ALLOWANCE` becomes `FREE_CHECKS_PER_MONTH`; add
  `AD_REWARD_CHECKS`, `AD_REWARDS_PER_DAY`, `FREE_LOG_HISTORY_DAYS`, `Plan.ads: boolean`,
  `Plan.logHistoryDays`. Free's feature list reads: "30 comment checks a month", "Watch an ad
  for 5 more", "+5 per friend you invite", "Last 7 days of your log", "Shows ads".
- `ModerationContext` computes `checksLeft`, `periodEnd`, `bonusChecks`, `adRewardsLeftToday`
  from the profile; the existing realtime subscription on `profiles` already pushes updates, so
  the meter updates within seconds of an ad reward landing on the server.
- Home meter: "12 of 30 checks left this month · resets 16 Oct", then, when under 10 checks or
  out: a "Watch an ad for +5 checks (3 left today)" button beside "Upgrade".
- `src/lib/protection.ts`: the `quota` state offers "watch an ad" first and "upgrade" second
  while ad rewards remain today, otherwise "upgrade" only.
- Connect accounts and onboarding: `outOfFreeChecks` reads from the new balance; wording drops
  the trial.
- Filters: the locked cards stay as they are (already the right pattern).
- Log: Free users see a footer row "Showing the last 7 days. Upgrade to keep your full history."
- Paywall: new first feature row on every paid plan: "No ads". Copy becomes "You're on Free"
  instead of "Your trial ends X".
- Settings: plan card says "Free · 30 checks a month · ads"; "Manage subscription" unchanged.

**Every gate stays server-enforced.** The app only decides what to show. Checks, account
limits, keyword and blocked-user rules and log history are all decided in SQL, as today.

## 4. Ad integration

**Packages**
- `react-native-google-mobile-ads` (Invertase): AdMob SDK with an Expo config plugin. Needs
  the EAS development build, like RevenueCat purchases; nothing ad-related runs in Expo Go.
- `expo-tracking-transparency`: Apple's App Tracking Transparency prompt. Ads still serve if the
  user declines; they're just non-personalised. Add the tracking usage description and Google's
  SKAdNetwork ids to `app.json`.
- `react-native-purchases` (already installed): `Purchases.adTracker` reports loaded, displayed,
  opened, failed and revenue events to RevenueCat.

**One module, `src/lib/ads.ts`**
- `adsConfigured`: true only in a dev/production build with an AdMob app id set and the user not
  paying. Everything below is a no-op otherwise, so Expo Go and the demo keep working.
- `initAds()`: gather EEA consent (Google's UMP form, built into the SDK), ask ATT, initialise.
  Called once after sign-in, and again when `subscription.paying` flips.
- `<AdSlot placement="home" | "log" />`: an adaptive banner. Renders nothing for paying users
  or when ads aren't configured, so layouts don't need two versions.
- `useRewardedAd()`: loads a rewarded ad with server-side verification options (user id +
  nonce in `custom_data`), shows it, and after "earned reward" waits for the realtime profile
  update (fallback: refetch after 5 seconds). Shows "Verifying…" then "+5 checks added".
- Every load, impression, click, failure and paid event is forwarded to RevenueCat with
  `mediatorName: adMob`, the format, the placement and the revenue Google reports (value,
  currency, precision). This is what makes it "RevenueCat Ads" in the dashboard and for the
  judges.

**Placements and frequency**
- Banner: bottom of Home and Log tabs, Free only. Nowhere else.
- Rewarded: only from the checks meter and the out-of-checks state. Server cap of 4 a day.
- No interstitials, no app-open ads. Revisit after launch with RevenueCat's ads charts.

**Accounts and setup you'll do** (kept for the end, as usual; AdMob and Apple can't wait)
- AdMob account, iOS app, two ad units: a banner and a rewarded one with server-side
  verification pointed at the SSV endpoint. Turn on impression-level ad revenue (RevenueCat
  needs it for revenue tracking). After the App Store listing exists, link the AdMob app to it.
- `app-ads.txt` on toxoff.app with the line AdMob gives you.
- RevenueCat: enable Ads in the project, connect AdMob so its ad units sync.
- App Store Connect privacy label: add "advertising data" and "device id" once ads are in.

**Testing**
- Unit: signature verification with a known key pair; `grant_ad_reward` limits (duplicate,
  daily cap, paying user) in the Docker SQL tests; `consume_comment_check` monthly reset.
- Device: Google's test ad unit ids in dev builds; a real rewarded test ad fires the SSV callback
  against the live server, so the whole loop can be checked before launch.

## 5. Order of work

1. Backend migration and function changes (trial removal, monthly allowance, ad rewards, log
   history). Tests.
2. App: remove the trial, wire the new allowance and copy. Verify in the simulator.
3. Ads module, placements, RevenueCat tracking, SSV endpoint. Needs the EAS dev build, so it
   comes after your Expo and Apple accounts exist.
4. README, PROGRESS.md, legal pages (the privacy policy must mention advertising and AdMob).
5. Shipaton assets: description, demo video showing the paywall and an ad, screenshots.

## Decisions (made 16 September)

- Monthly allowance: **50 a month** (not a lifetime cap).
- **5 checks per ad, 2 ads a day**, offered whenever the app is opened and ads remain that day.
- Log history on Free: **7 days**.
- Free keeps Auto hide-or-delete and push notifications. Banners on Home and Log only; no
  interstitials.
