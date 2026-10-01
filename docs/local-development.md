# Local development runbook

Local/Dev is the first environment and must be certified before Staging.

## Source and Shopify identity

- Git branch: `development`
- Shopify app: **VSN | Stock Down Sort Dev**
- Shopify config: `shopify.app.local.toml`
- prepare command: `npm run local:prepare`
- runtime command: `npm run dev`
- certification command: `npm run local:certify -- <local-health-url>/healthz`
- billing: test mode only

Do not run `shopify app config use` during the normal Local → Staging → Production flow. `npm run dev` explicitly uses the `local` config.

## Neon Local database

Local uses a dedicated Neon PostgreSQL project identity:

`vsn-stock-down-sort-local`

Status: repository tooling is ready; real workstation preparation/certification remains required until the exact Neon project ID, endpoint ownership and runtime health evidence are recorded.

Local database credentials must never be reused by Staging or Production.

Use:
- `DATABASE_URL` = pooled Neon runtime URL (hostname contains `-pooler`)
- `DIRECT_URL` = matching direct Neon migration URL (same endpoint identity, no `-pooler`)

Put real values in the uncommitted local `.env.local`. The runner loads `.env.local` first and falls back to `.env` only if `.env.local` is absent.

## Start sequence

```bash
git switch development
git pull --ff-only origin development
npm install
npm run local:prepare
npm run dev
```

`local:prepare` provisions or reuses only `vsn-stock-down-sort-local`, validates pooled/direct connection separation, verifies the real Neon project name and endpoint ownership through the Neon API, and applies Prisma migrations before the Shopify runtime is certified.

If the Shopify dev preview is still showing an old placeholder/default page, stop the current dev process and run once:

```bash
npm run dev:reset
```

Then choose the dedicated Dev app/store when prompted. After that, normal `npm run dev` is enough.

The Shopify web process runs `scripts/local-dev-runner.mjs`, which loads `.env.local`, validates Neon, and forwards the same environment to Prisma and React Router. It refuses to start when the database is not Neon, when the runtime URL is not pooled, when the migration URL is pooled, or when the two URLs do not belong to the same Neon endpoint.

After preparation and runtime validation:
1. `local:prepare` verifies the Neon project/endpoint and applies Prisma migrations.
2. `npm run dev` validates the Local environment again and generates the cloud Prisma client.
3. React Router starts under Shopify CLI.
4. The exact **VSN | Stock Down Sort Dev** app is used.
5. `npm run local:certify -- <local-health-url>/healthz` reruns migration safety checks, verifies the development health contract, and writes exact source-ref evidence to the Local gate.

## Exit criteria

Local/Dev is complete only when:
- `npm run local:prepare` succeeds on `development`;
- the dedicated Neon project ID resolves to `vsn-stock-down-sort-local`;
- the pooled/direct endpoint is verified as owned by that project;
- migrations succeed;
- `npm run dev` starts successfully;
- the app opens through **VSN | Stock Down Sort Dev**;
- `/healthz` reports development + PostgreSQL + billing test mode;
- `local:certify` records the exact accepted source ref;
- no Staging or Production credential is used.

Only then may PHASE-01 resume with the `cloudflare-staging` environment.
