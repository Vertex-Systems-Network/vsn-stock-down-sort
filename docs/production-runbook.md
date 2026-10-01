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

Production credentials must not be reused by Staging.

## Billing safety

Production requires:

- `APP_ENV=production`
- `SHOPIFY_BILLING_TEST_MODE=false`

The canonical four-plan catalog is `config/ai/product-plan.json`:

- Starter — USD 10.99 / 30 days / 10-day trial
- Growth — USD 19.99 / 30 days / 10-day trial
- Pro — USD 34.99 / 30 days / 10-day trial
- Unlimited — USD 54.99 / 30 days / 10-day trial

Existing legacy **VSN Stock Down Sort Pro / USD 55 / 5-day** subscriptions remain recognized as Unlimited-compatible until they are migrated by an approved plan change.

## Production readiness

Run **Production Readiness** with `VALIDATE_PRODUCTION`.

It verifies the immutable main source, staging acceptance on main, production secret presence and identity isolation, PostgreSQL migration state, Worker build and the four-plan billing catalog contract.

It does not apply production migrations or release Shopify.

## Worker preparation

Run **Cloudflare Production Prepare** with `PREPARE_PRODUCTION_WORKER_ONLY`.

This prepares the isolated Production Worker, verifies PostgreSQL, real billing mode, Queue readiness and the four-plan catalog. It does not release the Shopify production app.

## Shopify production promotion

1. Production Readiness.
2. Cloudflare Production Prepare.
3. Shopify Production Candidate with `CREATE_PRODUCTION_SHOPIFY_VERSION`.
4. Review the exact candidate version and source SHA.
5. Keep `config/shopify/production-release.json` unauthorized until explicit release approval is recorded.
6. Run Shopify Production Release only for the exact authorized candidate.

Production release re-checks the Worker health and four-plan billing catalog before Shopify release.

No Production release may bypass the Local → Staging → main → Live evidence chain.
