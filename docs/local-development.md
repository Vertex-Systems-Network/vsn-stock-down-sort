# Local development runbook

Local/Dev is the first environment and must be certified before Staging.

## Source and Shopify identity

- Git branch: `development`
- Shopify app: **VSN | Stock Down Sort Dev**
- Shopify config: `shopify.app.local.toml`
- Local database: Prisma + SQLite
- SQLite file: `prisma/dev.sqlite` (gitignored)
- prepare command: `npm run local:prepare`
- runtime command: `npm run dev`
- certification command: `npm run local:certify -- <local-health-url>/healthz`
- billing: test mode only

Normal Local development does **not** require Neon credentials, a Neon project, `DATABASE_URL`, or `DIRECT_URL`.

## Environment file

Create `.env.local` from `.env.local.example`. It should contain the dedicated Dev Shopify identity and secret only, plus normal Local app settings.

Do not put Staging or Production database credentials in `.env.local`.

## Start sequence

```bash
git switch development
git pull --ff-only origin development
npm install
npm run local:prepare
npm run dev
```

`local:prepare` validates the Local Shopify identity and SQLite contract, validates/generates Prisma from `prisma/schema.prisma`, applies the Local SQLite migrations, and creates `prisma/dev.sqlite` when needed.

`npm run dev` explicitly uses `shopify.app.local.toml`. The Shopify web process runs `scripts/local-dev-runner.mjs`, which regenerates/migrates the Local SQLite schema before React Router starts.

If the Shopify dev preview is still showing an old placeholder/default page, stop the current dev process and run once:

```bash
npm run dev:reset
```

Then select the dedicated **VSN | Stock Down Sort Dev** app/store if Shopify CLI prompts.

## Prisma split

Local and hosted environments intentionally use different Prisma datasources:

- Local: `prisma/schema.prisma` → SQLite
- Staging/Production: `prisma/cloud/schema.prisma` → PostgreSQL / Neon

Shared application models, fields and indexes are protected by `npm run prisma:parity`.

Local SQLite success is application-level Local evidence only. It is **not** PostgreSQL acceptance. Staging remains the first mandatory Neon/PostgreSQL runtime gate.

## Certification

After the app is running, certify the exact `development` source:

```bash
npm run local:certify -- http://127.0.0.1:3000/healthz
```

Use the actual Local health URL if Shopify CLI/React Router uses a different port.

Local certification requires:

- a clean `development` working tree;
- Local SQLite validation/generation/migration to pass;
- `prisma/dev.sqlite` to exist and remain gitignored;
- `/healthz` to report `environment=development`;
- `/healthz` to report `database=sqlite`;
- Shopify billing test mode to be true;
- the exact accepted source SHA to be recorded in `config/release/environment-gates.json`.

Only after that acceptance evidence exists may PHASE-01 proceed to `cloudflare-staging`.
