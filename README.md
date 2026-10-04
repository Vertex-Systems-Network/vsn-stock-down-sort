# VSN Stock Down Sort

VSN Stock Down Sort is an embedded Shopify app by Vertex Systems Network that keeps available products ahead of sold-out products in enabled collections.

## Product contract

The Shopify plan is:

- Four plan IDs: `starter`, `growth`, `pro`, `unlimited`
- Prices: USD 10.99 / 19.99 / 34.99 / 70.00 every 30 days
- Free trial: 10 days on every paid plan
- Products and collections: unlimited on every plan
- Unlimited products
- Unlimited collections
- Automatic sold-out product sorting
- Automatic re-sorting after inventory and product updates
- Manual **Sort Now**
- Bulk enable / disable
- Previous Shopify sort-order restore
- Support entitlement by plan: Starter/Growth = Standard, Pro = Priority, Unlimited = 24/7 Priority

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

Capability implementation is complete through PHASE-10. Runtime Issue #125 is closed and the previous Local → Staging → Live release cycle is accepted. Current work is a six-item development-only finalization track; no new Staging or Production promotion is allowed until all six items are complete. `config/ai/project-state.json` is the canonical current/next work snapshot. The older `.ai/state/**` and `.ai/tasks/**` files are compatibility mirrors only.

The repository includes Supervisor, Worker, governance, risk, audit, release, operations and project-management protocols derived from the VSN Metafields management baseline. No persistent autonomous orchestrator is currently certified, so agents must reconcile live GitHub state on every invocation and must not claim background leases or continuous execution.

## Public submission billing method

The Shopify App Store submission target is **Shopify App Pricing**. New subscriptions and plan changes use Shopify's hosted pricing page, and subscription state is read through the Partner API Active Subscription API. Existing Billing API subscriptions remain supported as a compatibility fallback until Shopify migration tooling moves them.

Only the Live/Production app uses `SHOPIFY_BILLING_MODE=shopify_app_pricing`, the Live Partner/app identifiers, and `SHOPIFY_PARTNER_API_ACCESS_TOKEN`. Local/Dev and Staging use `manual_legacy` test billing. The canonical decision is `config/shopify/billing-strategy.json`.

## Runtime architecture

VSN Stock Down Sort uses Prisma in all environments, with different database
providers by environment:

- Local / Development: Prisma + SQLite
- Staging: Prisma + isolated Neon PostgreSQL
- Production: Prisma + isolated Neon PostgreSQL

Prisma schemas:

- `prisma/schema.prisma` — Local SQLite
- `prisma/cloud/schema.prisma` — hosted PostgreSQL

Shared application models, fields and indexes are checked by
`npm run prisma:parity`.

Hosted Staging/Production are built for Cloudflare Workers and use:

- React Router application
- Web Streams SSR
- PostgreSQL
- Prisma `6.19.3`
- `@prisma/adapter-pg`
- request-scoped Prisma clients
- request-scoped Shopify session storage
- Cloudflare Queues for hosted webhook and bulk sorting work

Local uses the normal Prisma SQLite client and direct queue fallback. Local
SQLite acceptance is not PostgreSQL acceptance; Staging is the first mandatory
Neon/PostgreSQL runtime gate.

## Three isolated Shopify apps

The same codebase uses three separate Shopify app registrations.

| Environment | Shopify app | Config | Billing |
| --- | --- | --- | --- |
| Local / Development | VSN \| Stock Down Sort Dev | `shopify.app.local.toml` | Billing API test (`manual_legacy`) |
| Staging | VSN \| Stock Down Sort Staging | `shopify.app.staging.toml` | Billing API test (`manual_legacy`) |
| Live / Production | VSN \| Stock Down Sort | `shopify.app.production.toml` | Shopify App Pricing |

Database topology is also isolated:
- Local: gitignored SQLite file `prisma/dev.sqlite`
- Staging: dedicated Neon PostgreSQL, GitHub Environment `cloudflare-staging`
- Production: dedicated Neon PostgreSQL, GitHub Environment `cloudflare-production`

Local must be completed and verified before Staging work begins.

Local, Staging, and Live must use different Shopify client IDs and secrets.

The Staging client ID remains a placeholder in git and is injected from `cloudflare-staging`. The Live/Production client ID is committed in `shopify.app.production.toml`, matching the VSN Metafields model; `cloudflare-production` must provide the same `SHOPIFY_API_KEY`, while the API secret remains environment-scoped.

### Live App Pricing pre-submission test

Do not copy the Live public pricing catalog into the Staging Shopify app. To test Shopify App Pricing, install the **Live app** on a Partner development store and select each Live plan there. Use `.github/workflows/shopify-live-app-pricing-audit.yml` to verify the selected handle, USD amount, monthly interval and 10-day trial against the Live Partner API subscription state.

## Local development

Normal Local development runs from the `development` branch and uses the
dedicated **VSN | Stock Down Sort Dev** Shopify app with Prisma + SQLite.

```bash
git switch development
git pull --ff-only origin development
npm install
npm run local:prepare
npm run dev
```

`npm run local:prepare` validates the Local Shopify identity and SQLite
contract, validates/generates Prisma from `prisma/schema.prisma`, applies the
Local SQLite migrations, and creates `prisma/dev.sqlite` when needed.

Normal Local development requires **no** Neon API key, Neon project ID,
`DATABASE_URL`, or `DIRECT_URL`. The Local SQLite database is gitignored and
must never be committed.

Local `SCOPES` must include `read_products,write_products,read_inventory,read_locations,read_publications,write_publications`. `read_locations` is required by the Pro/Unlimited multi-location inventory capability.

`npm run dev` explicitly uses `shopify.app.local.toml`. The repository Local
runner regenerates/migrates the SQLite schema before React Router starts.

After the app is running, certify the exact `development` source:

```bash
npm run local:certify -- http://127.0.0.1:3000/healthz
```

Use the actual Local health URL if the runtime uses another port.

Local certification requires the health contract to report:

- `environment=development`
- `billingTestMode=true`
- `database=sqlite`

The accepted source SHA is then written to
`config/release/environment-gates.json`. Only after that acceptance may
Staging begin.

Do not manually switch the Local app to Staging or Production with
`shopify app config use`.

## AI-Native capability alignment

The AI-Native product contract currently contains **26 selected runtime capabilities** across Starter, Growth, Pro, and Unlimited. The canonical sources are:

- `config/ai/product-plan.json` — plan pricing, trials, hierarchy, support and option assignment
- `config/ai/options-bank.json` — option requirement/evidence metadata
- `config/ai/modules-bank.json` — module ownership
- `tests/ai-plan-alignment-contract.test.mjs` — machine-checkable cross-layer alignment

Every runtime option must be selected + implemented in the option bank, assigned to at least one plan, owned by a module, represented in merchant documentation, and backed by repository implementation evidence. `MOD-BILLING` owns the complete runtime option catalog because Shopify subscription resolution is the source of all plan entitlements.

The App Validation workflow also verifies the full Shopify scope contract required by the implemented feature set, including `read_locations` for multi-location inventory and `read_publications`/`write_publications` for commerce-context visibility.

## Validation

The main CI workflow validates:

- Local SQLite Prisma schema
- Local SQLite migrations
- Local/cloud Prisma model parity
- hosted PostgreSQL Prisma schema
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
5. **Staging Runtime Acceptance**
   - confirmation: `CERTIFY_STAGING_RUNTIME`
   - requires the exact accepted source SHA, dedicated staging shop domain, and actually active staging billing plan

Staging Worker:

`https://vsn-stock-down-sort-staging.vertexsystemsnetwork.workers.dev`

The Staging deployment creates/verifies its Queue and DLQ, applies database migrations, verifies the deployed `/healthz` contract, and can run signed, read-only Shopify session/subscription acceptance checks against an installed development store.

There is no separate required Cloudflare staging-bootstrap workflow.

## Production promotion

Production is a separate, controlled flow from protected `main`.

Run in this order:

1. **Environment Secrets Audit**
   - environment: `cloudflare-production`
   - confirmation: `AUDIT_ENVIRONMENT_SECRETS`
2. **Cloudflare Production Prepare**
   - confirmation: `PREPARE_PRODUCTION_WORKER_ONLY`
   - applies pending production migrations and prepares/verifies the Worker without Shopify cutover
3. **Production Readiness**
   - confirmation: `VALIDATE_PRODUCTION`
4. **Shopify Production Candidate**
   - confirmation: `CREATE_PRODUCTION_SHOPIFY_VERSION`
   - creates an unreleased production Shopify version
5. Explicitly authorize the exact candidate in:
   - `config/shopify/production-release.json`
6. **Shopify Production Release**
   - confirmation: `RELEASE_PRODUCTION_SHOPIFY_VERSION`
   - requires the exact authorized version

Production Worker:

`https://vsn-stock-down-sort-production.vertexsystemsnetwork.workers.dev`

Production release is blocked unless the repository authorization record, version name, and source SHA match. New development changes remain on `development` until the six-item finalization track is complete.

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
- `ALERT_FROM_EMAIL`
- `SUPPORT_INBOX_EMAIL`

### Production — GitHub Environment `cloudflare-production`

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_URL`
- `DIRECT_URL`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_APP_AUTOMATION_TOKEN`
- `SHOPIFY_PARTNER_API_ACCESS_TOKEN`
- `ALERT_FROM_EMAIL`
- `SUPPORT_INBOX_EMAIL`

`DIRECT_URL` is used for Prisma migration/readiness operations and is not uploaded to the Worker runtime. Staging sets `SHOPIFY_BILLING_MODE=manual_legacy` with test billing and does not require Partner API billing credentials. Production sets `SHOPIFY_BILLING_MODE=shopify_app_pricing`; the Live Partner organization/App GID are committed Worker vars and `SHOPIFY_PARTNER_API_ACCESS_TOKEN` remains a production secret.

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

## Support requests

Authenticated merchants can submit support requests from `/app/support`. Requests are persisted shop-scoped before notification delivery. Local development records requests without external delivery. Hosted Staging/Production use the existing Cloudflare `EMAIL` binding plus `ALERT_FROM_EMAIL` and `SUPPORT_INBOX_EMAIL` to notify the configured VSN support inbox. Priority is derived server-side from the active plan; the repository does not publish a response-time SLA.

## Important docs

- `docs/development-release-flow.md` — Local → manual Staging → reviewed main → manual Production flow
- `docs/environments.md` — three-app environment architecture
- `docs/staging-runbook.md` — Staging setup and promotion
- `docs/production-runbook.md` — Production readiness and release gates
- `config/shopify/production-release.json` — production release authorization policy
- `config/shopify/app-store-submission.json` — App Pricing + App Store finalization record
- `docs/shopify-app-store-submission.md` — Partner Dashboard, review and final smoke runbook

## Safety rules

- Never reuse the Local Shopify client ID in Staging or Production.
- Never reuse Staging credentials in Production.
- Never commit Shopify secrets or database credentials.
- Do not release a production Shopify candidate before the production Worker and billing contract are verified.
- Production billing must run with `SHOPIFY_BILLING_TEST_MODE=false`.
