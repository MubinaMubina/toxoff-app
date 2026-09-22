# toxoff App Store screenshots

Captured 21 September 2026 from the native app on the iPhone 17 Pro Max simulator (iOS 26.3).

Open `index.html` for the gallery. `toxoff-app-store-iphone-6.9.zip` contains only the six upload PNGs, in the order below. Each is **1320 × 2868**, portrait, 8-bit RGB, with no alpha channel. No iPad assets are included.

| Order | File | Visible content |
| --- | --- | --- |
| 1 | `iphone-6.9/01-home.png` | Protection status, `toxoff.demo`, 36 of 50 checks remaining, 12 comments handled over 7 days |
| 2 | `iphone-6.9/02-log-deleted.png` | Deleted tab, covered comments and “Read it anyway” |
| 3 | `iphone-6.9/03-log-hidden.png` | Hidden tab, expanded covered comment and “Restore comment” |
| 4 | `iphone-6.9/04-filters.png` | Sensitivity and the three flagged-comment actions |
| 5 | `iphone-6.9/05-paywall.png` | Solo, Plus and Studio monthly plans, with Plus selected |
| 6 | `iphone-6.9/06-welcome.png` | Mascot, app description, Get started free and Log in |

**Retaken 21 September (later the same day):** `01-home.png` and `03-log-hidden.png`, after the reviewer login was given an ordinary name (Home now greets "Sam" instead of "App") and the sample comments were given post references (the expanded row shows "Posted on: Post · New studio tour" instead of a dash). `capture.cjs` gained a `visibility VALUE` command for the "Count only" step. `export.cjs` was re-run and passed.

The signed-in screens use the actual App Review account and its existing demo dataset. The welcome screen was opened while that session remained signed in. Home retains the app's current “Your peace. Protected.” heading; `toxoff.demo` appears in its account card.

For the Hidden capture, the app's “Count only” visibility setting covered the sample text while keeping Restore visible. The original “Hide deleted” preference was restored afterward. No comments were revealed, restored, erased, or reseeded, and no purchases were made.

**Pricing provenance:** the simulator could not load StoreKit products. Screenshot 05 therefore uses the app's existing USD list-price preview configuration: Solo $6.99, Plus $12.99, Studio $29.99 per month. These are the configured list prices, not verified live App Store prices. The real reviewer session and backend were retained. No price text was composited into the image.

All screenshots are direct native captures without marketing overlays, device frames, resizing or retouching. Export removes the unused alpha channel while preserving every decoded pixel and the original color profile. Development-only warning overlays were suppressed for capture.

`export.cjs` validates all six files and recreates the ZIP. It checks dimensions, opacity, exact decoded pixel preservation, PNG integrity, RGB output, color-profile preservation and archive contents. `capture.cjs` is the local navigation helper; credentials are never embedded in either script.

Apple's [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) list 1320 × 2868 as a supported 6.9-inch iPhone portrait size. These files have not been uploaded to App Store Connect.
