# Local development runbook

Local/Dev is the first environment and must be certified before Staging.

## Source and Shopify identity

- Git branch: `development`
- Shopify app: **VSN | Stock Down Sort Dev**
- Shopify config: `shopify.app.toml`
- command: `npm run dev`
- billing: test mode only

Do not run `shopify app config use` during the normal Local → Staging → Production flow.

## Neon Local database

Local uses a dedicated Neon PostgreSQL project identity:

`vsn-stock-down-sort-local`

Status: provisioning/binding required until its real Neon project ID and endpoint are recorded.

Local database credentials must never be reused by Staging or Production.

Use:
- `DATABASE_URL` = pooled Neon runtime URL (hostname contains `-pooler`)
- `DIRECT_URL` = matching direct Neon migration URL (same endpoint identity, no `-pooler`)

Put real values in the uncommitted local `.env.local`. The runner loads `.env.local` first and falls back to `.env` only if `.env.local` is absent.

## Start sequence

```bash
git switch development
git pull
npm install
npm run dev
```

The Shopify web process runs `scripts/local-dev-runner.mjs`, which loads `.env.local`, validates Neon, and forwards the same environment to Prisma and React Router. It refuses to start when the database is not Neon, when the runtime URL is not pooled, when the migration URL is pooled, or when the two URLs do not belong to the same Neon endpoint.

After validation:
1. Prisma generates the cloud client.
2. Prisma applies migrations using `DIRECT_URL`.
3. React Router starts under Shopify CLI.
4. The Dev Shopify app is used.

## Exit criteria

Local/Dev is complete only when:
- dedicated Neon project/endpoint identity is recorded;
- pooled/direct URLs validate;
- migrations succeed;
- `npm run dev` starts successfully;
- the app opens through **VSN | Stock Down Sort Dev**;
- no Staging or Production credential is used.

Only then may PHASE-01 resume with the `cloudflare-staging` environment.
