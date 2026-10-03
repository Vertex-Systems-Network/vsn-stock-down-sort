# Production runtime gate

Production is isolated from Local and Staging.

## Required GitHub environment

Use `cloudflare-production` for:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_URL`
- `DIRECT_URL`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_AUTOMATION_TOKEN`
- `ALERT_FROM_EMAIL`

Production credentials must not be reused by Staging.

## Public submission billing method

For the initial public release, keep Partner Dashboard pricing set to **Manual Pricing** because the current app uses the Shopify Billing API to create recurring subscriptions. Enabling Shopify App Pricing before the code is migrated would create a mixed billing model and must be avoided. The policy is recorded in `config/shopify/billing-strategy.json`.

## Billing safety

Production requires:

- `APP_ENV=production`
- `SHOPIFY_BILLING_TEST_MODE=false`

The canonical four-plan catalog is `config/ai/product-plan.json`:

- Starter — USD 10.99 / 30 days / 10-day trial
- Growth — USD 19.99 / 30 days / 10-day trial
- Pro — USD 34.99 / 30 days / 10-day trial
- Unlimited — USD 70.00 / 30 days / 10-day trial

Existing legacy **VSN Stock Down Sort Pro / USD 55 / 5-day** subscriptions remain recognized as Unlimited-compatible until they are migrated by an approved plan change.

## Worker preparation

Run **Cloudflare Production Prepare** with `PREPARE_PRODUCTION_WORKER_ONLY`.

This applies pending production migrations, prepares the isolated Production Worker, verifies PostgreSQL, real billing mode, Queue readiness and the four-plan catalog. It does not release the Shopify production app.

## Production readiness

Run **Production Readiness** with `VALIDATE_PRODUCTION` after Worker preparation.

It verifies the immutable main source, staging acceptance on main, production secret presence and identity isolation, clean PostgreSQL migration state, Worker build and the four-plan billing catalog contract.

It does not apply production migrations or release Shopify.

## Shopify production promotion

1. Environment Secrets Audit for `cloudflare-production`.
2. Cloudflare Production Prepare.
3. Production Readiness.
4. Shopify Production Candidate with `CREATE_PRODUCTION_SHOPIFY_VERSION`.
5. Review the exact candidate version and source SHA.
6. Authorize only that exact candidate in `config/shopify/production-release.json`.
7. Run Shopify Production Release only for the exact authorized candidate.

Production release re-checks the Worker health and four-plan billing catalog before Shopify release.

No Production release may bypass the Local → Staging → main → Live evidence chain.

## Billing fail-closed rule

The subscription API and Plans UI must not cancel or replace an active Shopify subscription when its name, test flag, trial, interval, currency, or recurring amount does not match an approved VSN plan. Such subscriptions require review first. This protects existing or unexpected merchant billing from an automated plan mutation.

## Development finalization lock

New changes remain on `development` until all six finalization items in `config/ai/project-state.json` are complete. The previous accepted Production release stays authoritative until a fresh evidence-gated promotion is performed.
