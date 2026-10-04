# Shopify App Store submission

## Repository readiness

Repository development is prepared for Shopify App Pricing and final App Store submission. This document separates repository evidence from Partner Dashboard / Shopify review actions that cannot be completed from source control.

Canonical records:

- `config/shopify/app-store-submission.json`
- `config/shopify/billing-strategy.json`
- `config/ai/product-plan.json`
- `.github/workflows/final-production-merchant-smoke.yml`
- `config/shopify/app-store-listing-pack.json`
- `docs/shopify-app-store-listing-pack.md`

## Pricing content

Configure four **public monthly** Shopify App Pricing plans:

| Plan | Monthly price | Trial | Top capability summary |
| --- | ---: | ---: | --- |
| Starter | USD 10.99 | 10 days | Unlimited catalog, sold-out sorting, exclusions, email alerts |
| Growth | USD 19.99 | 10 days | Starter + pinning, advanced sorting, visibility automation, schedules, Slack |
| Pro | USD 34.99 | 10 days | Growth + multi-location, rule builder, analytics, CSV, priority support |
| Unlimited | USD 70.00 | 10 days | Pro + Markets/B2B/channel rules, API integrations, unlimited history, 24/7 priority support |

Use `/app` as the welcome link so Shopify returns the merchant to the embedded app after plan approval.

Plan descriptions must be configured for every language published in the App Store listing.

## Partner API runtime setup

Create a Partner API client for the **Live app**. The relevant identifiers are:

- Partner organization: `4859256`
- Live/Production app: `gid://shopify/App/405802811393`

Only Live/Production uses `SHOPIFY_BILLING_MODE=shopify_app_pricing` and requires `SHOPIFY_PARTNER_API_ACCESS_TOKEN`.

Local/Dev and Staging remain separate Shopify app identities and use `manual_legacy` test billing. Do not duplicate the Live App Store pricing catalog into the Staging app just to test billing. Test the Live App Pricing plans by installing the Live app on a Partner development store.

The application queries Partner API `activeSubscription` for current entitlement truth. An API error fails closed; it must not be interpreted as an unsubscribed merchant.

## Legacy Billing API merchants

Do not cancel or recreate existing valid Billing API subscriptions just to switch the app to Shopify App Pricing.

Existing subscriptions retain access through the compatibility fallback until they are migrated. Before allowing an existing Billing API merchant to change plans, migrate that subscription using Shopify's supported migration tooling.

The legacy USD 55 / 5-day subscription remains Unlimited-compatible until migration.

## Repository-prepared listing content

The English listing copy, reviewer walkthrough, screenshot capture plan, and demo screencast outline are prepared in `config/shopify/app-store-listing-pack.json` and `docs/shopify-app-store-listing-pack.md`.

Repository readiness does **not** mean the Shopify dashboard gate is complete. Actual Live-app screenshots, feature media, demo-store URL, screencast upload, contacts, protected-data declaration, automated checks, and final submission still require real external evidence.

## Listing and review checklist

The following are external Shopify/Partner Dashboard gates and must have real evidence before the finalization track is closed:

- App icon is the required 1200 × 1200 PNG/JPEG asset.
- At least one English Shopify App Store listing is complete.
- Pricing content matches the canonical four-plan catalog.
- API contact email and emergency developer contact are configured.
- Protected customer data declarations are completed as required by the submission form.
- Reviewer instructions explain installation, no-charge development-store plan selection, collection enable/disable, sorting, restore behavior, plan changes, and required test data. The canonical prepared instructions are in `docs/shopify-app-store-listing-pack.md`.
- Shopify automated submission checks pass.
- The app is submitted for review only after the listing and runtime are complete.
- After the accepted production release, run **Final Production Merchant Smoke** and preserve the successful workflow run as final evidence.

## Final merchant smoke

After the exact accepted source is released to Production:

1. Install/open the production app on the selected merchant/test store.
2. Select one of the four Shopify App Pricing plans.
3. Confirm the app returns to `/app` and recognizes the active plan.
4. Run the GitHub Action **Final Production Merchant Smoke** with the exact production source SHA, store domain, and expected plan ID.
5. A PASS verifies production health, PostgreSQL/Queue readiness, Shopify App Pricing mode, stored Shopify session, Admin API access, Partner API subscription resolution, and expected plan entitlement.

Do not mark finalization item 6 complete without a real successful production smoke run.
