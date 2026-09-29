# Production runtime gate

Production is intentionally isolated from local development and staging.

## Required GitHub environment

Create a GitHub Environment named `production` with these secrets:

- `DATABASE_URL`
- `DIRECT_URL`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL`
- `SCOPES`

The production values must not be reused by staging.

## Required Shopify config

Before any live cutover, replace the placeholders in
`shopify.app.production.toml` with the verified production Shopify client ID
and final HTTPS production URL.

## Billing safety

The live runtime requires:

- `APP_ENV=production`
- `SHOPIFY_BILLING_TEST_MODE=false`

The runtime startup script refuses production when the real-billing flag is not
explicitly false.

## Readiness workflow

Run **Production Readiness** and enter `VALIDATE_PRODUCTION`.

This workflow is read-only with respect to production schema changes: it checks
the migration status but does not apply migrations and does not deploy the app.
A production migration/deployment should only be introduced after staging has
passed end-to-end Shopify installation, billing approval, webhook, and sorting
tests.
