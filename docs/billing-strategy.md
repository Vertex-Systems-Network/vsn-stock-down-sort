# Billing strategy

## Three Shopify app identities

VSN Stock Down Sort intentionally uses three separate Shopify app registrations:

| Environment | Shopify app | Billing mode | Purpose |
| --- | --- | --- | --- |
| Local/Dev | VSN \| Stock Down Sort Dev | `manual_legacy`, test billing | Local development and Billing API test subscriptions |
| Staging | VSN \| Stock Down Sort Staging | `manual_legacy`, test billing | Hosted pre-production functional/runtime testing |
| Live/Production | VSN \| Stock Down Sort | `shopify_app_pricing` | App Store submission, public plans and merchant billing |

Only the **Live/Production app** owns the Shopify App Store listing and public Shopify App Pricing catalog.

## Live public pricing

Canonical Live plans:

- Starter — USD 10.99 / 30 days / 10-day trial
- Growth — USD 19.99 / 30 days / 10-day trial
- Pro — USD 34.99 / 30 days / 10-day trial
- Unlimited — USD 70.00 / 30 days / 10-day trial

Every plan has unlimited product and collection counts. Capability entitlements remain defined by `config/ai/product-plan.json`.

## How billing is tested

Local/Dev and Staging do **not** need copies of the Live App Pricing plans. They use Billing API test subscriptions so environment isolation stays intact.

Shopify App Pricing is tested on the **Live app itself** by installing that Live app on a development store in the same Partner organization. Shopify permits development stores to select the app's plans without a real charge. The Live audit workflow is:

`.github/workflows/shopify-live-app-pricing-audit.yml`

It verifies the Live app's plan handle, USD amount, monthly interval and configured 10-day trial against Partner API subscription/event data.

## Live runtime configuration

Live App Pricing requires:

- `SHOPIFY_BILLING_MODE=shopify_app_pricing`
- Partner organization ID `4859256`
- Live App GID `gid://shopify/App/405802811393`
- secret `SHOPIFY_PARTNER_API_ACCESS_TOKEN`

The Partner API client must have the permissions required by the Live subscription queries. The application fails closed if Live App Pricing mode is enabled without usable Partner API configuration.

## Staging runtime configuration

Staging uses:

- `SHOPIFY_BILLING_MODE=manual_legacy`
- `SHOPIFY_BILLING_TEST_MODE=true`
- the dedicated Staging Shopify client identity
- Billing API test subscriptions for Starter/Growth/Pro/Unlimited behavior

Staging does not depend on the Live App Store listing, Live plan handles or Partner API Active Subscription reads.

## Legacy Live Billing API compatibility

Existing Live Billing API subscriptions remain recognized during migration.

- Existing four-plan Billing API subscriptions remain mapped to the correct capability tier.
- Legacy USD 55 / 5-day subscriptions remain Unlimited-compatible.
- Once Live Shopify App Pricing is enabled, the Live app must not create new Billing API subscriptions.
- Existing Live Billing API merchants keep access until their subscriptions are migrated.

Canonical machine-readable policy: `config/shopify/billing-strategy.json`.
