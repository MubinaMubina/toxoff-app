# toxoff: App Store listing

Everything to paste into App Store Connect (app id 6813284133), field by field. Character limits
are Apple's; each text below fits. Written 21 September 2026.

**Version 1 ships without ads** (`EXPO_PUBLIC_ADS=off`; Google hasn't approved the AdMob account).
Everything below describes that version. The last section lists what changes when ads are turned on.

## App information

| Field | Value |
| --- | --- |
| Name (30) | `toxoff: Comment Filter` |
| Subtitle (30) | `Auto-remove hate, spam, trolls` |
| Primary category | Social Networking |
| Secondary category | Utilities |
| Content rights | Does not contain third-party content |
| Age rating | Step 1: Parental Controls No, Age Assurance No, Unrestricted Web Access No, User-Generated Content No (comments are shown only to the owner of the post, never shared through toxoff), Messaging and Chat No, **Advertising No** (version 1 has no ads). Step 2: **Profanity or Crude Humor: Infrequent** (the log can show abusive comments other people wrote), the rest None. Step 4: **Mature or Suggestive Themes: Infrequent** (hate and harassment are sensitive real-world topics), the rest None. Every other step: None / No. |
| Privacy policy URL | `https://toxoff.app/privacy.html` |
| Support URL | `https://toxoff.app/support.html` |
| Marketing URL | `https://toxoff.app` |
| Copyright | `2026 toxoff` |

The name and subtitle leave out "Instagram" on purpose: Apple rejects other companies' trademarks
there. It appears in the description, where describing what the app works with is allowed.

## Promotional text (170)

```
Toxic and spam comments removed from your posts within seconds, in 100+ languages. Free forever on one account.
```

## Description (4000)

```
You create. We filter.

toxoff watches the comments on your Instagram posts and removes the toxic and spam ones for you, usually within seconds, so you and your followers never have to read them.

HOW IT WORKS
• Connect your Instagram professional account (Creator or Business) in a few taps.
• toxoff checks every new comment with AI: harassment, hate speech, slurs, threats, self-harm bait and spam.
• Flagged comments are deleted or hidden straight away. You choose which.
• Everything it removed is kept in your log. Deleted comments stay covered unless you choose to read them, and hidden ones can be restored with one tap.

BUILT FOR CREATORS
• Works in 100+ languages, including slang and mixed scripts.
• Three sensitivity levels, and you pick which kinds of comments get removed.
• Pause protection on any account whenever you like.
• A daily summary or a notification per comment, or silence. Your choice.
• Your own keyword blocklist and blocked users list on paid plans.

FREE FOREVER
• 1 Instagram account
• 50 comment checks a month
• 5 more for each friend you invite (up to 3)
• The last 7 days of your log
• No card needed.

PAID PLANS: unlimited comments, your full log, your own blocklist
• Solo: 1 account
• Plus: up to 5 accounts, blocked users list, priority support
• Studio: up to 15 accounts, for managers and small agencies

PRIVACY
toxoff reads comments only to moderate your own posts. We never post on your behalf, never sell your information, and you can delete your account and data from inside the app at any time.

SUBSCRIPTIONS
Solo, Plus and Studio are auto-renewing subscriptions, billed monthly or yearly. Payment is charged to your Apple Account at confirmation of purchase. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel any time in your Apple Account settings.

Terms of service: https://toxoff.app/terms.html
Privacy policy: https://toxoff.app/privacy.html

toxoff is an independent app and is not affiliated with, endorsed by or sponsored by Instagram or Meta.
```

## Keywords (100)

```
moderation,toxic,bully,harassment,abuse,insult,block,hide,delete,mute,creator,influencer,reel,safety
```

"comment", "filter", "hate", "spam" and "trolls" are left out because Apple already indexes the words
in the name and subtitle; the room went to new search terms instead.

## What's new (first version)

```
The first release of toxoff.
```

## Subscriptions (one group: "toxoff", id 22393636)

Order the group's levels Studio (1), Plus (2), Solo (3), so moving up counts as an upgrade.
Each product needs a display name, a description (45 characters at most), a price and one review
screenshot (a screenshot of the paywall is what Apple expects; the same image can be used for all six).

| Product id | Display name | Description (45) | Price (USD) |
| --- | --- | --- | --- |
| `toxoff_solo_monthly` | Solo Monthly | Unlimited comment checks, 1 account | 6.99 |
| `toxoff_solo_annual` | Solo Yearly | Unlimited comment checks, 1 account | 49.99 |
| `toxoff_plus_monthly` | Plus Monthly | Unlimited comment checks, 5 accounts | 12.99 |
| `toxoff_plus_annual` | Plus Yearly | Unlimited comment checks, 5 accounts | 99.99 |
| `toxoff_studio_monthly` | Studio Monthly | Unlimited comment checks, 15 accounts | 29.99 |
| `toxoff_studio_annual` | Studio Yearly | Unlimited comment checks, 15 accounts | 249.99 |

Group display name: `toxoff` (English (U.S.), entered 21 September; levels are already in the right
order). A product is done when it no longer says **Missing Metadata**; on 21 September all six read
"Prepare for Submission".
The first subscriptions must be submitted together with the app version: on the version page, under
"In-App Purchases and Subscriptions", add all six before pressing Submit.

## App Review information

- **Sign-in required:** yes.
- **User name:** `appreview@toxoff.app`
- **Password:** kept in this Mac's Keychain, never written down here. Copy it to the clipboard with
  `security find-generic-password -s toxoff-reviewer-password -w | pbcopy`, then paste.
  (`node scripts/seed-reviewer.cjs` recreates the login if it is ever needed.)
- **Contact:** your name, phone number and `support@toxoff.app`.

**Notes** (paste as is):

```
toxoff removes toxic and spam comments from a creator's own Instagram posts, using Instagram's official API (Instagram API with Instagram Login). The user signs in to toxoff, connects their Instagram professional account through Instagram's own login page, and toxoff's server then checks new comments and hides or deletes the abusive ones. Everything removed is listed in the app's Log.

DEMO ACCOUNT
Please sign in with "Log in" using the email and password above (not Apple or Google). Connecting an Instagram account needs an Instagram professional account that you own, so this demo login comes with a sample connected account (@toxoff.demo) and sample moderated comments. With it you can see Home (totals and the monthly checks meter), the Log (Hidden and Deleted tabs; "Read it anyway" uncovers a deleted comment; Restore works on hidden ones), Filters, Accounts, Settings and the paywall. The sample data is refreshed daily.

The sample comments include mildly abusive text, because showing what was removed is the purpose of the app. Deleted comments are covered by default.

SUBSCRIPTIONS
In Settings, the plan card at the top opens the paywall, as do the upgrade prompts. Solo, Plus and Studio are auto-renewing subscriptions (monthly or yearly) sold only through Apple's in-app purchase. "Restore purchases" is on the paywall. Terms and privacy links are on the paywall and in Settings.

ADS AND TRACKING
This version shows no ads and does not track users. It never asks for tracking permission.

ACCOUNT DELETION
Settings > Delete my account deletes the account and all its data immediately.

SIGN IN WITH APPLE
Offered on the sign-up and login screens alongside Google and email.
```

## App Privacy ("nutrition label")

Answer **Yes, we collect data**. Then declare exactly these. Nothing is used for tracking in
version 1, so every "used to track you" question is **No**.

| Data type | Used for | Linked to the user | Tracking |
| --- | --- | --- | --- |
| Contact Info → Email Address | App Functionality | Yes | No |
| Contact Info → Name | App Functionality | Yes | No |
| User Content → Other User Content (comments on the user's posts, blocklist words) | App Functionality | Yes | No |
| Identifiers → User ID | App Functionality | Yes | No |
| Purchases → Purchase History | App Functionality, Analytics | Yes | No |

Export compliance: the app uses only standard HTTPS encryption, so answer **No** to proprietary
encryption (the build already says so: `ITSAppUsesNonExemptEncryption` is false in `app.json`).

## Screenshots

Required: 6.9-inch iPhone (1320 × 2868 or 1290 × 2796). Up to 10; the first three matter most.
Suggested order, all taken signed in as the reviewer login so the data looks real and safe:

1. Home: "Protecting @toxoff.demo", totals, the checks meter
2. Log, Deleted tab: covered comments with "Read it anyway"
3. Log, Hidden tab: a comment with Restore
4. Filters: sensitivity and what happens to flagged comments
5. Paywall: the three plans
6. Welcome screen with the mascot

No iPad screenshots are needed: `supportsTablet` is false in `app.json` (set 21 September), so toxoff
is an iPhone app that iPads run in iPhone size. Apple never lets an app drop iPad support after
release, but adding it later is fine, so starting without it is the choice that can be undone.

## When ads are turned on (a later update)

After Google approves the AdMob account: set `EXPO_PUBLIC_ADS=on` in the build's environment, ship
a new build, and change these in App Store Connect with that version:

- **Age rating, step 1:** Advertising → Yes.
- **Description:** under FREE FOREVER add "Watch a short ad for 5 more checks, up to twice a day"
  and "The Free plan shows ads."; change the paid line to "unlimited comments, no ads, your full log".
- **Subscription descriptions:** "Unlimited checks, no ads, 1 account" (5 / 15 for Plus / Studio).
- **Review notes, ADS AND TRACKING:** the Free plan shows a banner ad on Home and offers optional
  rewarded ads ("Watch an ad for +5 checks"), served by Google AdMob; the app asks for tracking
  permission before the first ad, and declining only makes ads non-personalised; paid plans show none.
- **App Privacy**, following Google's guide
  (https://developers.google.com/admob/ios/privacy/data-disclosure), add, all "not linked":
  Device ID (Third-Party Advertising, Analytics; **tracking: Yes**), Advertising Data (same;
  **tracking: Yes**), Product Interaction (same; no tracking), Coarse Location (Third-Party
  Advertising), Crash Data and Performance Data (Analytics).
