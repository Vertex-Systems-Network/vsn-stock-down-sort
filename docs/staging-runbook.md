# Staging runtime runbook

VSN Stock Down Sort keeps local development isolated from hosted environments.

## Environment topology

| Tier | Shopify config | Database | Billing |
| --- | --- | --- | --- |
| Local / dev | `shopify.app.local.toml` | Neon PostgreSQL (dedicated Local project) | Test |
| Staging | `shopify.app.staging.toml` | Neon PostgreSQL (isolated) | Test |
| Production | `shopify.app.production.toml` | Neon PostgreSQL (isolated) | Real |

The active Prisma schema for local, staging, and production is `prisma/cloud/schema.prisma`.

## GitHub staging environment

Use the existing GitHub Environment `cloudflare-staging`:

https://github.com/Vertex-Systems-Network/vsn-stock-down-sort/settings/environments/23050370538/edit

Add these secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_URL` — pooled/runtime PostgreSQL connection string.
- `DIRECT_URL` — direct PostgreSQL connection string for Prisma migrations only; it is not uploaded to the Worker.
- `SHOPIFY_API_KEY` — staging Shopify app client ID.
- `SHOPIFY_API_SECRET` — staging Shopify app secret.
- `SHOPIFY_APP_AUTOMATION_TOKEN` — Shopify CLI automation token used only by
  the staging version/release Actions.

Do not copy production values into the staging environment.

## Shopify staging app

The staging Workers URL is fixed to:

- `https://vsn-stock-down-sort-staging.vertexsystemsnetwork.workers.dev`

The dedicated Shopify staging app Client ID intentionally remains a placeholder
in git:

- `__SHOPIFY_STAGING_CLIENT_ID__`

Do **not** replace or commit it. GitHub Actions inject the real
`SHOPIFY_API_KEY` into a disposable checkout when creating or releasing a
staging Shopify version.

The staging Shopify app must be installed only on a development/test store.

## Readiness gate

Run the **Staging Readiness** workflow and enter `VALIDATE_STAGING`.

It refuses to proceed when:

- a required staging secret is missing;
- the staging URL is not HTTPS;
- the staging Shopify secret identity matches the Local/Dev app;
- the committed staging config no longer contains the expected safe placeholder;
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


## Post-deploy acceptance

Every staging deployment verifies `/healthz` and requires the deployed runtime
to report:

- service `vsn-stock-down-sort`;
- environment `staging`;
- PostgreSQL runtime;
- Shopify test billing enabled;
- the 5-day / USD 55 plan contract.

The deployment form also accepts an optional `staging_shop` value such as a
`*.myshopify.com` development-store domain. After the staging Shopify app has
been installed on that shop, provide this value to run the signed, read-only
`/internal/staging-acceptance` probe.

That probe proves:

- an offline Shopify session is stored;
- Shopify Admin GraphQL is readable;
- `activeSubscriptions` can be read.

The request is HMAC-signed with the staging Shopify API secret, expires after
five minutes, and the endpoint is unavailable outside the fixed staging
runtime. It never creates or cancels subscriptions.


## Shopify staging promotion

Before any Staging work, Local/Dev must pass using the dedicated Neon Local database.

Local development stays simple:

`npm run dev`

No manual Shopify config switching is required.

After runtime readiness and Cloudflare staging deployment pass:

1. Run **Shopify Staging Version** and enter
   `CREATE_STAGING_SHOPIFY_VERSION`.
2. The Action checks out `development`, injects the staging Client ID from
   GitHub secrets only in that disposable runner, and creates an unreleased
   version named like
   `stock-down-sort-staging-<source-sha>-<run-number>`.
3. Copy the exact candidate version name from the Action summary.
4. Run **Shopify Staging Release**, enter
   `RELEASE_STAGING_SHOPIFY_VERSION`, and provide that exact version name.

This process does not modify `shopify.app.toml` or
`shopify.app.production.toml`.


## Staging sort queue

Cloudflare Staging Deploy ensures these resources exist before deploying the
Worker:

- `vsn-stock-down-sort-staging-sort-jobs`
- `vsn-stock-down-sort-staging-sort-jobs-dlq`

The Worker both produces to and consumes from the main queue through the
`STOCK_SORT_QUEUE` binding. Hosted webhook sorting and bulk enablement use the
queue; local development retains the direct fallback.
