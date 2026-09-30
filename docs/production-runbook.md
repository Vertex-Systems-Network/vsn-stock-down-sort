# Production runtime gate

Production is intentionally isolated from local development and staging.

## Required GitHub environment

Use the existing GitHub Environment `cloudflare-production`:

https://github.com/Vertex-Systems-Network/vsn-stock-down-sort/settings/environments/23098399859/edit

Configure these secrets:

- `DATABASE_URL`
- `DIRECT_URL`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_AUTOMATION_TOKEN` — used only by Shopify candidate/release Actions

The production values must not be reused by staging.

## Required Shopify config

The committed `shopify.app.production.toml` intentionally keeps
`__SHOPIFY_PRODUCTION_CLIENT_ID__`. Do **not** commit the Live Client ID.

The production URL is fixed to:

`https://vsn-stock-down-sort-production.vertexsystemsnetwork.workers.dev`

GitHub Actions inject the real Live Client ID from the `cloudflare-production`
Environment only into a disposable runner.

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


## Cloudflare production target

The production Worker contract is `wrangler.production.jsonc`. Worker
preparation and Shopify release are deliberately separate operations. A
successful Worker deployment does not release or mutate the Live Shopify app.


## Cloudflare production Worker preparation

The isolated production Worker target is:

`https://vsn-stock-down-sort-production.vertexsystemsnetwork.workers.dev`

Run **Cloudflare Production Prepare** and type
`PREPARE_PRODUCTION_WORKER_ONLY`.

This workflow:

- checks the production database migration status without applying migrations;
- builds and dry-runs the Cloudflare Worker bundle;
- deploys only the isolated production Worker;
- verifies `/healthz` reports production, PostgreSQL, real billing mode, and the
  5-day / USD 55 billing contract;
- does **not** update or release Shopify production URLs/configuration.

A successful Worker preparation therefore does not authorize Shopify cutover.


## Shopify production promotion

Production follows an action-driven candidate → authorization → release flow.

1. Run **Production Readiness** with `VALIDATE_PRODUCTION`.
2. Run **Cloudflare Production Prepare** with
   `PREPARE_PRODUCTION_WORKER_ONLY`.
3. After the production Worker health check passes, run
   **Shopify Production Candidate** with
   `CREATE_PRODUCTION_SHOPIFY_VERSION`.
4. The Action checks out protected `main`, injects the Live Client ID only in
   the disposable runner, and creates an **unreleased** version named like:
   `stock-down-sort-production-<source-sha>-<run-number>`.
5. Review the exact candidate and source SHA. Production release remains blocked
   while `config/shopify/production-release.json` has
   `release_authorized=false`.
6. Only after explicit repository authorization records the exact version and
   40-character source SHA may **Shopify Production Release** run with
   `RELEASE_PRODUCTION_SHOPIFY_VERSION`.

The release Action re-checks the production Worker health and exact
`unlimited` / USD 55 / 5-day billing contract before releasing the authorized
Shopify version.

It does not apply database migrations and does not trigger product or inventory
webhooks during release.


## Production sort queue

Cloudflare Production Prepare ensures these resources exist before deploying
the isolated production Worker:

- `vsn-stock-down-sort-production-sort-jobs`
- `vsn-stock-down-sort-production-sort-jobs-dlq`

The queue is infrastructure-only and does not authorize or perform the Shopify
production cutover. Shopify candidate/release gates remain separate.
