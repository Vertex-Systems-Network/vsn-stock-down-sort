# Staging runtime runbook

VSN Stock Down Sort keeps local development isolated from hosted environments.

## Environment topology

| Tier | Shopify config | Database | Billing |
| --- | --- | --- | --- |
| Local / dev | `shopify.app.toml` | PostgreSQL | Test |
| Staging | `shopify.app.staging.toml` | PostgreSQL | Test |
| Production | `shopify.app.production.toml` | PostgreSQL | Real |

The active Prisma schema for local, staging, and production is `prisma/cloud/schema.prisma`.

## GitHub staging environment

Create a GitHub Environment named `staging` and add these secrets:

- `DATABASE_URL` — pooled/runtime PostgreSQL connection string.
- `DIRECT_URL` — direct PostgreSQL connection string for Prisma migrations only; it is not uploaded to the Worker.
- `SHOPIFY_API_KEY` — staging Shopify app client ID.
- `SHOPIFY_API_SECRET` — staging Shopify app secret.

Do not copy production values into the staging environment.

## Shopify staging app

The staging Workers URL is fixed to:

- `https://vsn-stock-down-sort-staging.vertexsystemsnetwork.workers.dev`

Only the dedicated Shopify staging app client ID remains a placeholder:

- `__SHOPIFY_STAGING_CLIENT_ID__`

The staging Shopify app must be installed only on a development/test store.

## Readiness gate

Run the **Staging Readiness** workflow and enter `VALIDATE_STAGING`.

It refuses to proceed when:

- a required staging secret is missing;
- the staging URL is not HTTPS;
- the Shopify staging config still contains placeholders;
- the PostgreSQL schema or migrations are invalid;
- lint, typecheck, or build fails.

Staging always requires `SHOPIFY_BILLING_TEST_MODE=true`.

## Production safety

Production must use a separate database and separate Shopify app credentials.
Runtime startup refuses production when
`SHOPIFY_BILLING_TEST_MODE` is not explicitly `false`.


## Worker deployment

After **Staging Readiness** passes, run **Cloudflare Staging Deploy** and type
`DEPLOY_DEVELOPMENT_TO_STAGING`.

The deployment always checks out the `development` branch, applies staging
migrations, builds and dry-runs the Worker bundle, then deploys with runtime
secrets. The temporary secrets file is deleted even if deployment fails.


## Public staging runtime values

These values are intentionally committed as non-secret staging configuration:

- `SHOPIFY_APP_URL=https://vsn-stock-down-sort-staging.vertexsystemsnetwork.workers.dev`
- `SCOPES=read_products,write_products,read_inventory`

They must not be duplicated as GitHub or Cloudflare secrets.
