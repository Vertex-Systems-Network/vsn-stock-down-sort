# VSN Stock Down Sort environments

This repository uses three isolated runtime tiers so local development, staging
validation, and live merchant traffic do not share Shopify credentials or
billing behavior.

## Local / development

- Shopify config: `shopify.app.toml`
- Runtime: `APP_ENV=development`
- Billing: `SHOPIFY_BILLING_TEST_MODE=true`
- URL behavior: Shopify CLI may update development URLs automatically.
- Use a development store only.
- Database: local SQLite via `prisma/schema.prisma`.
- Do not use live merchant credentials.

## Staging

- Shopify config: `shopify.app.staging.toml`
- Runtime: `APP_ENV=staging`
- Billing: `SHOPIFY_BILLING_TEST_MODE=true`
- Use a dedicated staging Shopify app/client ID and a staging store.
- Database: isolated PostgreSQL via `prisma/cloud/schema.prisma`.
- Replace the `.example.invalid` host only when a staging deployment URL exists.
- Staging can run with `NODE_ENV=production`; `APP_ENV=staging` is what keeps
  billing in test mode.

## Live / production

- Shopify config: `shopify.app.production.toml`
- Runtime: `APP_ENV=production`
- Billing: `SHOPIFY_BILLING_TEST_MODE=false`
- Use the live Shopify app/client ID and production deployment URL only.
- Database: a production PostgreSQL database isolated from staging.
- This is the only tier allowed to create real recurring merchant charges.

## Billing contract

The app exposes one Pro plan:

- USD 55 every 30 days
- 5-day free trial
- Unlimited products
- Unlimited collections
- Automatic sold-out product sorting
- Automatic re-sorting after inventory/product updates
- Manual and bulk collection controls
- Previous Shopify sort-order restore support
- 24/7 support

The authoritative code contract is `app/billing-config.ts`.

## Required runtime variables

Copy `.env.example` for local development and configure equivalent protected
variables/secrets in staging and production:

- `APP_ENV`
- `SHOPIFY_BILLING_TEST_MODE`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL`
- `SCOPES`
- `DATABASE_URL` (staging/production)
- `DIRECT_URL` (staging/production migrations)

Never copy production API secrets into development or staging.

## Deployment safety

Before staging or production deployment:

1. Replace the placeholder Shopify client ID and host in the matching TOML file.
2. Verify `/healthz` reports the expected environment and the billing contract
   `55 USD / EVERY_30_DAYS / 5 trial days`.
3. Confirm staging reports `billingTestMode: true`.
4. Confirm production reports `billingTestMode: false`.
5. Use separate PostgreSQL databases for staging and production. Local
   development remains on SQLite.
6. Hosted startup runs `scripts/runtime-setup.mjs`, which selects the correct
   Prisma schema and refuses unsafe staging/production billing flags.
