# Staging runtime runbook

VSN Stock Down Sort keeps Local development isolated from hosted environments.

## Environment topology

| Tier | Shopify config | Database | Billing |
| --- | --- | --- | --- |
| Local / dev | `shopify.app.local.toml` | Dedicated Neon PostgreSQL | Test |
| Staging | `shopify.app.staging.toml` | Isolated Neon PostgreSQL | Test |
| Production | `shopify.app.production.toml` | Isolated Neon PostgreSQL | Real |

The active Prisma schema for all three tiers is `prisma/cloud/schema.prisma`.

## GitHub staging environment

Use the existing `cloudflare-staging` GitHub Environment and keep all real credentials there:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_URL` — pooled/runtime PostgreSQL connection
- `DIRECT_URL` — direct PostgreSQL connection for Prisma migrations only
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_AUTOMATION_TOKEN`

Do not copy Production credentials into Staging.

## Readiness gate

Run **Staging Readiness** with `VALIDATE_STAGING`.

Staging is blocked until Local/Dev acceptance exists for the exact development source commit. The workflow also checks staging secret presence, Shopify identity isolation, PostgreSQL schema/migrations, lint/typecheck/build and the four-plan billing catalog contract.

Staging always uses `SHOPIFY_BILLING_TEST_MODE=true`.

## Billing contract

The canonical catalog is `config/ai/product-plan.json`:

| Plan | Price / 30 days | Trial |
| --- | ---: | ---: |
| Starter | USD 10.99 | 10 days |
| Growth | USD 19.99 | 10 days |
| Pro | USD 34.99 | 10 days |
| Unlimited | USD 54.99 | 10 days |

All four plans have unlimited products and collections. Capability differences are represented by option IDs in the catalog.

The runtime currently marks only the implemented base sorting capabilities as available. Planned capabilities remain explicitly labelled as planned until their own implementation and verification evidence exists.

## Shopify staging app

Staging uses the separate **VSN | Stock Down Sort Staging** app and the fixed Worker URL:

`https://vsn-stock-down-sort-staging.vertexsystemsnetwork.workers.dev`

The staging Client ID remains a secret placeholder in git. GitHub Actions inject the real value only into the disposable runner.

## Deployment

After Local acceptance and **Staging Readiness** pass, manually run **Cloudflare Staging Deploy** with:

`DEPLOY_DEVELOPMENT_TO_STAGING`

The workflow checks out the accepted `development` source, provisions/verifies the Staging Queue and DLQ, applies migrations, builds and deploys the Worker, and verifies `/healthz`.

The deployment does not release the Shopify Staging app version automatically.

## Post-deploy acceptance

The deployed `/healthz` must report:

- `service=vsn-stock-down-sort`
- `environment=staging`
- `database=postgresql`
- `billingTestMode=true`
- exactly four catalog plans with the approved IDs, prices, 30-day interval and 10-day trials.

The optional signed `/internal/staging-acceptance` probe additionally checks Shopify Admin GraphQL and reports whether the active subscription matches one of the approved plans. It is read-only and never creates or cancels a subscription.

## Shopify staging promotion

After Worker acceptance:

1. Run **Shopify Staging Version** with `CREATE_STAGING_SHOPIFY_VERSION`.
2. Record the exact unreleased candidate version and source SHA.
3. Run **Shopify Staging Release** with `RELEASE_STAGING_SHOPIFY_VERSION` and the exact candidate name.

No Staging action may mutate the Live Shopify app identity.

## Queue

Staging deploy ensures:

- `vsn-stock-down-sort-staging-sort-jobs`
- `vsn-stock-down-sort-staging-sort-jobs-dlq`

are available before the Worker is considered ready.
