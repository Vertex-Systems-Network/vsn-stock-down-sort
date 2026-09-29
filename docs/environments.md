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
3. replace the placeholders in `shopify.app.staging.toml`;
4. run **Staging Readiness**;
5. run **Cloudflare Staging Deploy** only after readiness passes.

Production stays manual and requires a separate production readiness/cutover
decision.
