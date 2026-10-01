# Development, Staging, and Live Release Flow

VSN Stock Down Sort uses three isolated Shopify applications and a strict evidence-gated promotion path.

## 1. Local / Dev

Local development is always on `development`:

```bash
git switch development
git pull
npm install
npm run dev
```

The Local runner uses `shopify.app.local.toml`, validates the Dev Shopify identity and requires the dedicated Neon project identity `vsn-stock-down-sort-local`.

Bootstrap the Local Neon project when the Neon API credential is available:

```bash
npm run local:provision-neon
```

Then:

```bash
npm run dev
npm run local:certify -- http://127.0.0.1:3000/healthz
```

Local certification is not satisfied by CI alone. It requires real Neon connectivity, Prisma migration, a running Dev Shopify app, the development health contract and a clean working tree.

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
