# VSN Stock Down Sort

VSN Stock Down Sort is an embedded Shopify app by Vertex Systems Network that keeps available products ahead of sold-out products in enabled collections.

## Product contract

The Shopify plan is:

- Plan ID: `unlimited`
- Price: USD 55 every 30 days
- Free trial: 5 days
- Unlimited products
- Unlimited collections
- Automatic sold-out product sorting
- Automatic re-sorting after inventory and product updates
- Manual **Sort Now**
- Bulk enable / disable
- Previous Shopify sort-order restore
- 24/7 support

Production only recognizes the exact current VSN Stock Down Sort subscription as an entitlement.

## Repository management model

This repository uses the same repository-first management pattern as VSN Metafields.

Canonical management chain:

```text
GitHub Issue / Phase
        ↓
config/ai/project-state.json
        ↓
config/ai/execution-plan.json
        ↓
bounded branch
        ↓
Pull Request
        ↓
CI / review evidence
        ↓
merge
        ↓
verification
        ↓
project-state update / next work unit
```

The active phase is anchored to GitHub Issue #32. `config/ai/project-state.json` is the canonical current/next work snapshot. The older `.ai/state/**` and `.ai/tasks/**` files are compatibility mirrors only.

The repository includes Supervisor, Worker, governance, risk, audit, release, operations and project-management protocols derived from the VSN Metafields management baseline. No persistent autonomous orchestrator is currently certified, so agents must reconcile live GitHub state on every invocation and must not claim background leases or continuous execution.

## Runtime architecture

The hosted runtime is built for Cloudflare Workers.

- React Router application
- Web Streams SSR
- PostgreSQL
- Prisma `6.19.3`
- `@prisma/adapter-pg`
- request-scoped Prisma clients
- request-scoped Shopify session storage
- Cloudflare Queues for hosted webhook and bulk sorting work
- local direct fallback when no Queue binding is present
- Shopify asynchronous collection reorder jobs are awaited before a sort is marked successful

The active Prisma schema is:

`prisma/cloud/schema.prisma`

The old Shopify-template SQLite guidance does not apply to the active runtime.

## Three isolated Shopify apps

The same codebase uses three separate Shopify app registrations.

| Environment | Shopify app | Config | Billing |
| --- | --- | --- | --- |
| Local / Development | VSN Stock Down Sort Dev | `shopify.app.toml` | test |
| Staging | VSN Stock Down Sort Staging | `shopify.app.staging.toml` | test |
| Live / Production | VSN Stock Down Sort | `shopify.app.production.toml` | real |

Database topology is also isolated:
- Local: dedicated Neon project `vsn-stock-down-sort-local`
- Staging: dedicated Neon PostgreSQL, GitHub Environment `cloudflare-staging`
- Production: dedicated Neon PostgreSQL, GitHub Environment `cloudflare-production`

Local must be completed and verified before Staging work begins.

Local, Staging, and Live must use different Shopify client IDs and secrets.

The Staging and Production client IDs intentionally remain placeholders in git. GitHub Actions inject the real environment-specific IDs only into disposable runners.

## Local development

Normal development happens from `development` or a short-lived feature branch based on it.

```bash
git switch development
git pull
npm install
npm run dev
```

`npm run dev` remains the normal command and uses the default `shopify.app.toml`. Before the web process starts, the repo validates that `DATABASE_URL` is a pooled Neon URL and `DIRECT_URL` is the matching direct Neon URL, then applies Prisma migrations.

Local development uses the `development` branch and the dedicated Local Neon database. It never deploys Staging or Production. Pushes to `development` run validation only.

Do not manually switch the Local app to Staging or Production with `shopify app config use`.

## Validation

The main CI workflow validates:

- PostgreSQL Prisma schema
- Worker Prisma generation
- lint
- TypeScript
- runtime contract tests
- Worker build
- Cloudflare Staging dry-run
- Cloudflare Production dry-run

Useful local checks:

```bash
npm run lint
npm run typecheck
node --test tests/worker-runtime-contract.test.mjs
npm run build:worker
```

## Staging promotion

Staging promotion is **manual GitHub Action driven**, matching the VSN Metafields release model.

A push to `development` does not deploy Staging. The staging deploy workflow always checks out `development` only after an explicit manual dispatch.

Run in this order:

1. **Staging Readiness**
   - confirmation: `VALIDATE_STAGING`
2. **Cloudflare Staging Deploy**
   - confirmation: `DEPLOY_DEVELOPMENT_TO_STAGING`
3. **Shopify Staging Version**
   - confirmation: `CREATE_STAGING_SHOPIFY_VERSION`
   - creates an unreleased Shopify version from `development`
4. **Shopify Staging Release**
   - confirmation: `RELEASE_STAGING_SHOPIFY_VERSION`
   - requires the exact candidate version name

Staging Worker:

`https://vsn-stock-down-sort-staging.vertexsystemsnetwork.workers.dev`

The Staging deployment creates/verifies its Queue and DLQ, applies database migrations, verifies the deployed `/healthz` contract, and can run signed, read-only Shopify session/subscription acceptance checks against an installed development store.

There is no separate required Cloudflare staging-bootstrap workflow.

## Production promotion

Production is a separate, controlled flow from protected `main`.

Run in this order:

1. **Production Readiness**
   - confirmation: `VALIDATE_PRODUCTION`
2. **Cloudflare Production Prepare**
   - confirmation: `PREPARE_PRODUCTION_WORKER_ONLY`
   - prepares and verifies the Worker without Shopify cutover
3. **Shopify Production Candidate**
   - confirmation: `CREATE_PRODUCTION_SHOPIFY_VERSION`
   - creates an unreleased production Shopify version
4. Explicitly authorize the exact candidate in:
   - `config/shopify/production-release.json`
5. **Shopify Production Release**
   - confirmation: `RELEASE_PRODUCTION_SHOPIFY_VERSION`
   - requires the exact authorized version

Production Worker:

`https://vsn-stock-down-sort-production.vertexsystemsnetwork.workers.dev`

Production release is blocked unless the repository authorization record, version name, and source SHA match.

## Environment secrets

The real credentials belong in GitHub Environments, not in committed files.

### Staging — GitHub Environment `cloudflare-staging`

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_URL`
- `DIRECT_URL`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_AUTOMATION_TOKEN`

### Production — GitHub Environment `cloudflare-production`

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_URL`
- `DIRECT_URL`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_AUTOMATION_TOKEN`

`DIRECT_URL` is used for Prisma migration/readiness operations and is not uploaded to the Worker runtime.

## Sort job queues

Hosted Staging and Production Workers use Cloudflare Queues so webhook-triggered
sorting and **Enable all** do not keep heavy sorting work inside the incoming
HTTP request.

- Staging: `vsn-stock-down-sort-staging-sort-jobs`
- Production: `vsn-stock-down-sort-production-sort-jobs`
- Binding: `STOCK_SORT_QUEUE`
- Consumer batch size: 1 for deterministic collection processing
- Failed messages retry and can move to the environment-specific DLQ

The deploy workflows create the Queue and DLQ when they do not already exist.
Local `npm run dev` has no Queue binding and uses the direct deterministic
fallback.

Shopify connection pagination uses the API maximum of 250 nodes per page to
reduce Admin API subrequests.

## Shopify webhooks

The app declares:

- `app/uninstalled`
- `app/scopes_update`
- `inventory_levels/update`
- `products/update`
- mandatory privacy/compliance webhooks:
  - `customers/data_request`
  - `customers/redact`
  - `shop/redact`

Shop-scoped persisted data is purged for uninstall / shop-redact lifecycle events.

## Important docs

- `docs/development-release-flow.md` — Local → manual Staging → reviewed main → manual Production flow
- `docs/environments.md` — three-app environment architecture
- `docs/staging-runbook.md` — Staging setup and promotion
- `docs/production-runbook.md` — Production readiness and release gates
- `config/shopify/production-release.json` — production release authorization policy

## Safety rules

- Never reuse the Local Shopify client ID in Staging or Production.
- Never reuse Staging credentials in Production.
- Never commit Shopify secrets or database credentials.
- Do not release a production Shopify candidate before the production Worker and billing contract are verified.
- Production billing must run with `SHOPIFY_BILLING_TEST_MODE=false`.
