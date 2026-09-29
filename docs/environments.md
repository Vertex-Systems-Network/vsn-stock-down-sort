# VSN Stock Down Sort environments

The app uses the same PostgreSQL-backed, engine-less Prisma runtime in all
tiers. Credentials, Shopify identities, billing mode, and database instances
remain isolated by environment.

VSN Stock Down Sort uses **three separate Shopify app registrations**:

- Local / Development: `VSN Stock Down Sort Dev` → `shopify.app.toml`
- Staging: `VSN Stock Down Sort Staging` → `shopify.app.staging.toml`
- Live / Production: `VSN Stock Down Sort` → `shopify.app.production.toml`

The three apps must have different Shopify client IDs and secrets. A client ID,
secret, install, subscription, or session from one tier must never be reused in
another tier.

| Tier | Source flow | Shopify config | Database | Billing |
| --- | --- | --- | --- | --- |
| Development | local / `development` | `shopify.app.toml` | development PostgreSQL | test |
| Staging | `development` → manual deploy | `shopify.app.staging.toml` | staging PostgreSQL | test |
| Production | protected `main` | `shopify.app.production.toml` | production PostgreSQL | real |

## Runtime database

The active schema is `prisma/cloud/schema.prisma`.

It uses:

- PostgreSQL;
- Prisma engine-less client;
- `@prisma/adapter-pg`;
- request-scoped Prisma clients;
- request-scoped Shopify Prisma session storage.

The original SQLite schema/migrations remain repository history only and are not
used by the active runtime.

## Required runtime values

Every environment requires:

- `APP_ENV`
- `SHOPIFY_BILLING_TEST_MODE`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_URL`
- `SCOPES`
- `DATABASE_URL`

Migration commands additionally require:

- `DIRECT_URL`

`DIRECT_URL` is not uploaded to the Cloudflare Worker. It remains restricted to
migration/readiness jobs.

## Billing contract

The Pro plan remains:

- USD 55 every 30 days;
- 5-day free trial;
- unlimited products;
- unlimited collections;
- automatic sold-out sorting;
- automatic inventory/product re-sorting;
- manual and bulk controls;
- previous Shopify sort-order restore;
- 24/7 support.

Development and staging must use test billing. Production startup requires real
billing mode explicitly.

## Worker runtime

Cloudflare configuration:

- `workers/app.js`
- `wrangler.staging.jsonc`
- `wrangler.production.jsonc`

The Worker runs the React Router server bundle, uses Web Streams SSR, and reads
runtime bindings through `process.env`.

Staging Worker URL: `https://vsn-stock-down-sort-staging.vertexsystemsnetwork.workers.dev`.

Before staging deployment:

1. configure the GitHub `staging` environment;
2. supply staging PostgreSQL and Shopify credentials;
3. keep the committed staging Client ID placeholder intact;
4. run **Staging Readiness**;
5. run **Cloudflare Staging Deploy** only after readiness passes.

Production stays manual and requires a separate production readiness/cutover
decision.


## Action-driven Shopify environment flow

Local development does not switch configs manually.

Run:

`npm run dev`

That command is exactly `shopify app dev` and uses the default
`shopify.app.toml`, which is dedicated to **VSN Stock Down Sort Dev**.

Do not run `shopify app config use` as part of the normal Local → Staging →
Live flow.

### Move Development to Staging

Staging promotion is controlled by GitHub Actions, following the same pattern
used by VSN Metafields:

1. `Staging Readiness` validates the isolated staging runtime and database.
2. `Cloudflare Staging Deploy` deploys the `development` branch to the
   staging Worker.
3. `Shopify Staging Version` reads the staging Shopify Client ID from the
   GitHub `staging` environment, injects it only into the disposable Actions
   checkout, and creates an **unreleased** Shopify app version.
4. `Shopify Staging Release` releases only the exact staging version supplied
   to the workflow.

The committed `shopify.app.staging.toml` intentionally keeps
`__SHOPIFY_STAGING_CLIENT_ID__`. The real staging Client ID is a GitHub
Environment secret and must not be committed.

### Live / Production

Live is also Action-driven; there is no normal manual config switch.

1. **Production Readiness** validates the Live environment and separate Live
   Shopify identity.
2. **Cloudflare Production Prepare** deploys and certifies the isolated
   production Worker without Shopify cutover.
3. **Shopify Production Candidate** injects the Live Client ID from the GitHub
   `production` Environment only in the disposable runner and creates an
   unreleased candidate from protected `main`.
4. `config/shopify/production-release.json` must explicitly authorize that
   exact candidate and source SHA.
5. **Shopify Production Release** releases only that exact authorized version.

The committed `shopify.app.production.toml` keeps
`__SHOPIFY_PRODUCTION_CLIENT_ID__`; the real Live Client ID must not be
committed.

Local development and staging actions must never select or mutate the Live
Shopify app identity.


## Hosted sort queue

Staging and Production Workers bind a dedicated Cloudflare Queue as
`STOCK_SORT_QUEUE`.

- Staging queue: `vsn-stock-down-sort-staging-sort-jobs`
- Production queue: `vsn-stock-down-sort-production-sort-jobs`

Each environment also uses a matching `-dlq` dead-letter queue. Deployment
workflows create missing Queue resources before Worker deployment.

Hosted inventory/product webhook sorts and bulk **Enable all** work are queued.
Local development keeps the direct fallback because `npm run dev` does not
require Cloudflare Queue resources.
