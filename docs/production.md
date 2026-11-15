# Side in production: what it takes to charge for it

Decisions (2026-11-15): Lemon Squeezy as merchant of record; Side Pro as a monthly or yearly
subscription with a 14-day trial (card up front, set on the Lemon Squeezy product); free Side keeps
working with simple rules, and Side Pro adds Claude.

## Feature list

| # | Feature | Why it is needed to charge | Status |
|---|---|---|---|
| 1 | **Claude through Side's server** (`web/waitlist/api/llm.ts`) | Buyers can't be asked for an Anthropic key. The server holds the key, fixes the model and limits, refuses web addresses, stores no text. | Done |
| 2 | **License check on every Claude request** (`lib/entitlement.ts`, `lib/lemon.ts`) | The paywall must hold on the server, not only in the app. Checked against Lemon Squeezy at most hourly per computer (a hash of the key is cached, never the key); key must be from our store and product and activated on that computer. | Done |
| 3 | **Daily limit per license** (200 requests) | One leaked key or a loop can't run up the Claude bill. Past it, Side uses rules until tomorrow. | Done |
| 4 | **Activate / sign out / refresh** (`api/license.ts`) | A buyer pastes the key once; moving to another computer frees the slot. | Done |
| 5 | **Side Pro in the app** (`main/licenseService.ts`, Settings → Side Pro) | Free, Pro, Ended and Developer states; key sealed with the macOS Keychain; checked at launch and twice a day; 14 days offline grace; a 402 from the server flips the computer back to rules at once; Pro can start or end without a restart. Korean included. | Done |
| 6 | **Free stays private** | Without Pro nothing is sent, as the README promised. The app decides before sending; the server decides again. | Done |
| 7 | **Packaged app** (`npm run dist`) | `git clone && npm start` is not a product. electron-builder: dmg + zip, arm64 + x64, hardened runtime, entitlements and usage strings for Apple Events and Calendars, extension folder in Resources. | Done (unsigned build checked) |
| 8 | **Code signing and notarization** | macOS blocks unsigned downloads. Configured; needs your Apple Developer ID (below). | Needs your account |
| 9 | **Auto-update** (`main/autoUpdate.ts`) | Paying users must get fixes. GitHub Releases, checks every 6 hours, installs on quit. Works only on signed builds. | Done (needs signed releases) |
| 10 | **Pricing page** (`/pricing`) | Free vs Pro. Until Pro is on sale it sends people to the waitlist, matching the landing page (price goes to the waitlist first). | Live, waitlist only |
| 11 | **Terms, privacy, refunds** (`web/waitlist/drafts/`) | Required by Lemon Squeezy and by Korean e-commerce law (business details in the footer). Kept out of the deployed `public/` until the placeholders are filled. | Drafts, need legal review and your details |
| 12 | **Honest copy** | Every screen that said "Claude key" or "to Claude" now says Side Pro and "through the Side server". README updated. | Done |
| 13 | **Chrome Web Store listing** | Developer mode + Load unpacked loses most buyers. `npm run package:extension` makes the zip. | Needs submission |

Not built on purpose (add when there is a reason): accounts and login (the license key is the account), webhooks (validate already reflects cancellations and refunds), Windows, team plans, in-app checkout.

## Launch checklist (things only you can do)

1. **Lemon Squeezy**: create the store and one product "Side Pro" with two subscription variants, Monthly ($6) and Yearly ($48), each with a 14-day trial. Turn on license keys for the product, activation limit **3**, and set the license key to follow the subscription.
2. **Pricing page**: when Pro opens, set the prices in `web/waitlist/public/pricing.html` and point its two Pro buttons at the variants' checkout links (they go to the waitlist today).
3. **Legal**: move `web/waitlist/drafts/*.html` back into `public/`, link them from the footers, fill `[COMPANY_NAME]`, `[REPRESENTATIVE]`, `[BUSINESS_NO]`, `[MAIL_ORDER_NO]` (mail-order business report number), `[ADDRESS]`, `[CONTACT_EMAIL]`, `[PRIVACY_OFFICER]`, `[EFFECTIVE_DATE]` in the four pages, then have them reviewed. Korean versions are still to write.
4. **Vercel env** (project `side-waitlist`): `ANTHROPIC_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_PRODUCT_ID`, and the existing `DATABASE_URL`.
5. **Database**: run the schema again (`node web/waitlist/scripts/migrate.mjs`): it adds `license_checks` and `llm_usage`.
6. **Deploy** the web project, then test with a Lemon Squeezy test-mode key: activate in Settings, set a day aside, check "What Side saw".
7. **Apple**: Developer ID Application certificate in the Keychain, then `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` in the environment and `npm run dist`. For releases, `GH_TOKEN` and `npm run release` (draft release on `ssyutudio/side`; the repository must be public, or point `build.publish` at a public releases repository, for the updater to read it).
8. **Chrome Web Store**: `npm run package:extension`, submit `out/side-extension.zip`, then point the setup window at the listing.
9. **Cost**: Side Pro uses `claude-opus-5-5` at low effort ($4 / $20 per million tokens). Measure a real day's usage per user before fixing the price; a smaller model is your call, not a default.

## Local commands

```bash
npm test                 # everything, server handlers included
npm run dist:unsigned    # Side.app in out/mac-arm64, no signing (add -c.electronDist=node_modules/electron/dist offline)
npm run dist             # signed + notarized dmg/zip (needs step 7)
npm run release          # same, published to GitHub Releases
npm run package:extension
```

## Deploys

The waitlist site (`web/waitlist`) is the Vercel project `side-waitlist`. Until the GitHub connection
below exists, deploy by hand from `web/waitlist`: `vercel deploy --prod`.

To deploy automatically when a PR merges into `main`:
1. In Vercel, Account Settings → Authentication: connect your GitHub login, and give the Vercel GitHub app access to `ssyutudio/side`.
2. Then, from `web/waitlist`:
   ```bash
   vercel git connect https://github.com/ssyutudio/side.git --yes
   vercel api /v9/projects/side-waitlist -X PATCH -f rootDirectory=web/waitlist -F sourceFilesOutsideRootDirectory=false -f commandForIgnoringBuildStep='git diff --quiet HEAD^ HEAD -- .'
   ```
   Root Directory `web/waitlist` with nothing from outside it keeps Vercel from installing the whole
   monorepo (Electron included); the ignore step skips builds when nothing under `web/waitlist` changed.
   After this, manual `vercel deploy` runs from the repository root.
