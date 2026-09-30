# Development, Staging, and Live Release Flow

VSN Stock Down Sort uses three isolated Shopify app identities and a manual promotion model.

## 1. Local development

Normal Local development runs from the `development` branch. The Local runner rejects other branches.

```bash
git switch development
git pull
npm install
npm run dev
```

`npm run dev` runs Shopify CLI with `--config local`, so the authoritative Local config is `shopify.app.local.toml`, belonging only to **VSN | Stock Down Sort Dev**.

Local development never deploys Staging or Production.

Local secret files such as `.env`, `.env.local`, and `.dev.vars` are ignored and must never be committed.

Local database policy:
- provider: Neon PostgreSQL
- project identity: `vsn-stock-down-sort-local`
- `DATABASE_URL`: pooled Neon connection
- `DIRECT_URL`: matching direct Neon connection
- Local must never reuse Staging or Production database credentials.

## 2. Development branch

Pushes and pull requests run validation only.

A push to `development` must not deploy Cloudflare Staging and must never deploy Production.

## 3. Manual Staging

Staging uses:

- Shopify app: **VSN | Stock Down Sort Staging**
- Shopify config: `shopify.app.staging.toml`
- GitHub Environment: `cloudflare-staging`
- Cloudflare Worker: `vsn-stock-down-sort-staging`
- billing mode: test
- source branch: `development`

To deploy, manually run **Cloudflare Staging Deploy** and type:

`DEPLOY_DEVELOPMENT_TO_STAGING`

The workflow always checks out `development`, provisions/verifies the staging sort Queue and DLQ, applies staging database migrations, builds and deploys the Worker, then verifies health, Queue readiness, billing, and optional signed Shopify acceptance.

There is no separate required staging-bootstrap workflow.

## 4. Release branch

`main` is the release branch.

Release path:

`development -> reviewed PR -> main`

Merging to `main` does not automatically deploy Production.

## 5. Live / Production

Production uses:

- Shopify app: **VSN | Stock Down Sort**
- Shopify config: `shopify.app.production.toml`
- GitHub Environment: `cloudflare-production`
- Cloudflare Worker: `vsn-stock-down-sort-production`
- billing mode: real
- source branch: `main`

Production Worker preparation is manual. Shopify production candidate creation is also manual, and the exact candidate must be explicitly authorized in repository policy before final Shopify release.

## Daily flow

```text
Local Neon setup
   ↓
Local app verification
   ↓
development branch
   ↓
automatic validation only
   ↓
manual DEPLOY_DEVELOPMENT_TO_STAGING
   ↓
Cloudflare Staging + Staging Shopify app
   ↓
verify
   ↓
PR: development → main
   ↓
main
   ↓
manual Production Worker preparation
   ↓
manual unreleased Shopify production candidate
   ↓
exact repository authorization
   ↓
manual Shopify production release
```

Core rule: **development never becomes staging or live automatically.**
