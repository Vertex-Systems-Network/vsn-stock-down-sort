# VSN Stock Down Sort environments

The app uses an environment-aware Prisma data layer. Local/Dev uses SQLite for
fast Shopify development, while Staging and Production use isolated Neon
PostgreSQL databases. Shopify identities, billing mode, and hosted credentials
remain isolated by environment.

VSN Stock Down Sort uses **three separate Shopify app registrations**:

- Local / Development: `VSN | Stock Down Sort Dev` → `shopify.app.local.toml`
- Staging: `VSN | Stock Down Sort Staging` → `shopify.app.staging.toml`
- Live / Production: `VSN | Stock Down Sort` → `shopify.app.production.toml`

The three apps must have different Shopify client IDs and secrets. A client ID,
secret, install, subscription, or session from one tier must never be reused in
another tier.

| Tier | Source flow | Shopify config | Database | Billing |
| --- | --- | --- | --- | --- |
| Development | local / `development` | `shopify.app.local.toml` | Prisma SQLite (`prisma/dev.sqlite`, gitignored) | test |
| Staging | `development` → manual deploy | `shopify.app.staging.toml` | isolated Neon PostgreSQL | test |
| Production | protected `main` | `shopify.app.production.toml` | isolated Neon PostgreSQL | real |

## Runtime database

Prisma is split intentionally by environment:

- Local: `prisma/schema.prisma` → SQLite at `prisma/dev.sqlite`
- Staging/Production: `prisma/cloud/schema.prisma` → Neon PostgreSQL
- Shared application models, fields and indexes must pass `npm run prisma:parity`

Local uses the normal Prisma client without `@prisma/adapter-pg`. Hosted
Staging/Production use the engine-less cloud client with
`@prisma/adapter-pg`.

The Local SQLite database and journal files are gitignored. Local must not
require or reuse hosted database credentials.

## Required runtime values

Local requires:

- `APP_ENV=development`
- `SHOPIFY_BILLING_TEST_MODE=true`
- dedicated Dev `SHOPIFY_API_KEY`
- dedicated Dev `SHOPIFY_API_SECRET`
- `SCOPES=read_products,write_products,read_inventory,read_publications,write_publications`

Local does not require Neon credentials, `DATABASE_URL`, or `DIRECT_URL`.

Staging and Production additionally require their isolated hosted values:

- `SHOPIFY_APP_URL`
- `DATABASE_URL` for pooled Neon runtime access
- `DIRECT_URL` for direct Prisma migration/readiness access
- `ALERT_FROM_EMAIL` for hosted low-stock email delivery

`DIRECT_URL` is not uploaded to the Cloudflare Worker. It remains restricted
to hosted migration/readiness jobs.

## Billing contract

The current catalog contains four stable plan IDs:

- `starter` — USD 10.99 every 30 days / 10-day trial;
- `growth` — USD 19.99 every 30 days / 10-day trial;
- `pro` — USD 34.99 every 30 days / 10-day trial;
- `unlimited` — USD 54.99 every 30 days / 10-day trial.

All four current plans include unlimited products and collections. Capability
differences are capability-based, and unimplemented capabilities must fail
closed.

Existing legacy USD 55 / 5-day subscriptions remain recognized only for
compatibility until an approved merchant plan change.

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

1. complete Local/Dev SQLite certification;
2. configure the GitHub `cloudflare-staging` environment;
3. supply isolated staging Neon and Shopify credentials;
4. keep the committed staging Client ID placeholder intact;
5. run **Staging Readiness**;
6. run **Cloudflare Staging Deploy** only after readiness passes.

Production stays manual and requires a separate production readiness/cutover
decision.


## Action-driven Shopify environment flow

Local development does not switch configs manually.

Run:

`npm run dev`

That command runs Shopify CLI with `--config local` and therefore uses
`shopify.app.local.toml`, which is dedicated to **VSN | Stock Down Sort Dev**.

Do not run `shopify app config use` as part of the normal Local → Staging →
Live flow.

### Move Development to Staging

Staging promotion is controlled by GitHub Actions, following the same pattern
used by VSN Metafields:

1. `Staging Readiness` validates the isolated staging runtime and database.
2. `Cloudflare Staging Deploy` deploys the `development` branch to the
   staging Worker.
3. `Shopify Staging Version` reads the staging Shopify Client ID from the
   GitHub `cloudflare-staging` environment, injects it only into the disposable Actions
   checkout, and creates an **unreleased** Shopify app version.
4. `Shopify Staging Release` releases only the exact staging version supplied
   to the workflow.
5. `Staging Runtime Acceptance` certifies the deployed/released exact source against the dedicated staging shop and active staging billing plan.

The committed `shopify.app.staging.toml` intentionally keeps
`__SHOPIFY_STAGING_CLIENT_ID__`. The real staging Client ID is a GitHub
Environment secret and must not be committed.

### Live / Production

Live is also Action-driven; there is no normal manual config switch.

1. **Production Readiness** validates the Live environment and separate Live
   Shopify identity.
2. **Cloudflare Production Prepare** deploys and certifies the isolated
   production Worker without Shopify cutover.
3. **Shopify Production Candidate** verifies that the
   `cloudflare-production` `SHOPIFY_API_KEY` matches the committed Live client
   ID in `shopify.app.production.toml`, then creates an unreleased candidate
   from protected `main`.
4. `config/shopify/production-release.json` must explicitly authorize that
   exact candidate and source SHA.
5. **Shopify Production Release** releases only that exact authorized version.

The committed `shopify.app.production.toml` contains the Live Shopify client
ID by design. The `cloudflare-production` `SHOPIFY_API_KEY` must match it;
the API secret remains environment-scoped and must never be committed.

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


## Canonical GitHub Environment records

- Staging: `cloudflare-staging` — https://github.com/Vertex-Systems-Network/vsn-stock-down-sort/settings/environments/23050370538/edit
- Production: `cloudflare-production` — https://github.com/Vertex-Systems-Network/vsn-stock-down-sort/settings/environments/23098399859/edit

These names are authoritative for Actions bindings. Do not create parallel `staging` or `production` GitHub Environments for this project.

## Local-first order

Local/Dev must be certified before Staging:

1. checkout `development`;
2. use **VSN | Stock Down Sort Dev**;
3. keep `.env.local` free of hosted database/Neon credentials;
4. run `npm run local:prepare` to validate/generate/migrate SQLite;
5. run `npm run dev`;
6. verify `/healthz` reports development + SQLite + billing test mode;
7. run `npm run local:certify -- <local-health-url>/healthz`;
8. record Local acceptance, then proceed to `cloudflare-staging`.

Staging is the first required real Neon/PostgreSQL runtime acceptance gate.
