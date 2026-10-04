# Development, Staging, and Live Release Flow

VSN Stock Down Sort uses three isolated Shopify applications and a strict evidence-gated promotion path.

## 1. Local / Dev

Local development is always on `development` and uses Prisma + SQLite:

```bash
git switch development
git pull --ff-only origin development
npm install
npm run local:prepare
npm run dev
```

The Local runner uses `shopify.app.local.toml` and the dedicated **VSN | Stock Down Sort Dev** identity. The Local database is the gitignored `prisma/dev.sqlite` file.

Normal Local development requires no Neon API key, Neon project ID, hosted `DATABASE_URL`, or `DIRECT_URL`.

Local Prisma uses `prisma/schema.prisma` (SQLite). Staging and Production use `prisma/cloud/schema.prisma` (Neon PostgreSQL). CI checks shared model/index parity across both schemas.

Then certify the running Local app:

```bash
npm run local:certify -- http://127.0.0.1:3000/healthz
```

Local certification is not satisfied by CI alone. It requires a real Dev Shopify app boot, SQLite persistence, the development health contract, and the exact source-ref acceptance record.

SQLite Local acceptance does not prove PostgreSQL behavior. Staging remains the first mandatory Neon/PostgreSQL runtime acceptance gate.

## 2. Development CI

Pushes to `development` run validation only. They do not deploy Staging or Production.

## 3. Staging

Staging is manually promoted from an accepted `development` source:

```text
Local acceptance
    ↓
Staging Readiness
    ↓
Cloudflare Staging Deploy
    ↓
Shopify Staging Version
    ↓
Shopify Staging Release
    ↓
Staging Runtime Acceptance
```

Staging uses test billing and its own Shopify identity, Neon database, Cloudflare Worker and Queue.

## 4. Main / release

The release path is:

`development → reviewed PR → main`

Main remains protected and is the only Production source.

## 5. Live / Production

Production uses:

- separate Shopify app identity
- separate Neon PostgreSQL
- separate Cloudflare Worker
- real billing
- manual Worker preparation
- unreleased Shopify candidate
- explicit candidate authorization
- final manual Shopify release

## Billing catalog

The approved catalog contains exactly four stable IDs:

| ID | Price / 30 days | Trial |
| --- | ---: | ---: |
| `starter` | USD 10.99 | 10 days |
| `growth` | USD 19.99 | 10 days |
| `pro` | USD 34.99 | 10 days |
| `unlimited` | USD 70.00 | 10 days |

Products and collections are unlimited for all four tiers. Capability differences are capability-based rather than catalog-count limits.

## Core invariant

**Local/Dev → Staging → Live.**

Missing, stale or failed evidence blocks promotion. A deployment is not itself an acceptance record.

## Finalization gates

Finalization follows the release order; it is not a bundle that must be completed before the first promotion:

1. Certify the exact current `development` source in Local/Dev.
2. Promote that exact accepted source to Staging, release its Shopify version, and pass Staging Runtime Acceptance.
3. Record the accepted Staging source on protected `main` through the reviewed promotion PR.
4. Before Production release, pass the Live-only App Pricing audits, production Partner API/secrets checks, legacy-subscription review, and App Store listing/media/review prerequisites.
5. Prepare Production, create and authorize the exact Shopify candidate, then release it.
6. Run Final Production Merchant Smoke against that exact released source. Keep finalization open until it passes.

A failed or stale gate blocks only the next dependent step. In particular, the post-release merchant smoke does not block Local certification or Staging promotion.
