# Billing strategy

## Public submission target

VSN Stock Down Sort targets **Shopify App Pricing** for the Shopify App Store submission.

Shopify hosts the plan-selection and approval experience. The application reads the merchant's current subscription through the Partner API `activeSubscription` query when `SHOPIFY_BILLING_MODE=shopify_app_pricing`.

Public catalog:

- Starter — USD 10.99 / 30 days / 10-day trial
- Growth — USD 19.99 / 30 days / 10-day trial
- Pro — USD 34.99 / 30 days / 10-day trial
- Unlimited — USD 70.00 / 30 days / 10-day trial

Every plan has unlimited product and collection counts. Capability entitlements remain defined by `config/ai/product-plan.json`.

## Runtime configuration

Hosted App Pricing requires:

- `SHOPIFY_BILLING_MODE=shopify_app_pricing`
- committed Partner organization ID `214077920`
- committed per-environment app GID:
  - Staging: `gid://shopify/App/430575026177`
  - Production: `gid://shopify/App/405802811393`
- secret credential `SHOPIFY_PARTNER_API_ACCESS_TOKEN`

The Partner API client must have **Manage apps** permission. Organization ID and App GIDs are identifiers, not credentials; only the Partner API access token is stored as a hosted secret.

If App Pricing mode is enabled and Partner API configuration is incomplete or the Partner API request fails, the app fails closed instead of treating a paying merchant as unsubscribed.

## Merchant flow

For new subscriptions and plan changes in App Pricing mode:

1. The app verifies the merchant session.
2. The app reads the active subscription through the Partner API.
3. If the merchant needs a plan, the app sends them to Shopify's hosted `pricing_plans` page.
4. Shopify handles plan selection, charge approval, trials, billing and redirects.
5. The app verifies the resulting active subscription through the Partner API before granting paid access.

The app does **not** call `appSubscriptionCreate` for new subscriptions while App Pricing mode is enabled.

## Legacy Billing API compatibility

Existing Billing API subscriptions are preserved during migration.

- Current four-plan Billing API subscriptions remain recognized.
- Legacy USD 55 / 5-day subscriptions remain mapped to Unlimited-compatible access.
- An unmigrated Billing API merchant keeps access but cannot silently switch through the App Pricing flow; migrate the subscription first.
- Migration can use Shopify's Partner Dashboard subscription migration tool or Shopify CLI subscription-migration commands.
- Direct Billing API subscription creation remains available only when the explicit runtime mode is `manual_legacy`; it is not the public-submission target.

Canonical machine-readable policy: `config/shopify/billing-strategy.json`.
