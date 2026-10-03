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
| `unlimited` | USD 54.99 | 10 days |

Products and collections are unlimited for all four tiers. Capability differences are capability-based rather than catalog-count limits.

## Core invariant

**Local/Dev → Staging → Live.**

Missing, stale or failed evidence blocks promotion. A deployment is not itself an acceptance record.
