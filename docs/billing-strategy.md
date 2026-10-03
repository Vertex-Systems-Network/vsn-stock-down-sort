# Billing strategy

## Initial public submission

VSN Stock Down Sort uses **Manual Pricing / Shopify Billing API** for the initial Shopify App Store submission.

The current application creates recurring subscriptions with `appSubscriptionCreate` and reads subscription state through the Admin API. Therefore the Partner Dashboard pricing method must remain **Manual Pricing** for this release. Do not enable Shopify App Pricing while this code path is active.

Current public catalog:

- Starter — USD 10.99 / 30 days / 10-day trial
- Growth — USD 19.99 / 30 days / 10-day trial
- Pro — USD 34.99 / 30 days / 10-day trial
- Unlimited — USD 70.00 / 30 days / 10-day trial

Legacy USD 55 / 5-day subscriptions remain mapped to Unlimited-compatible access until merchants change plans.

## Future Shopify App Pricing migration

Shopify App Pricing is the default/recommended billing method for new public apps, but it uses Shopify-hosted plan selection and Partner API subscription reads. A future migration must add those integrations and stop using `appSubscriptionCreate` for new subscriptions before the Partner Dashboard pricing method is switched.

Canonical machine-readable policy: `config/shopify/billing-strategy.json`.
