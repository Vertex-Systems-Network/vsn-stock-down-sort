# Last Checkpoint

This file is a compatibility mirror. Canonical live state is:

- `config/ai/project-state.json`
- `config/ai/execution-plan.json`
- `config/architecture/decision-records.json`
- GitHub Issue #32
- live Git/PR/CI evidence

## ADR-0001 implementation evidence

The repository implementation for the accepted environment architecture has passed App Validation #271 on tree `b0970d0dbe4a0556543770f5755f72f529dc62aa`:

1. Local/Dev — **VSN | Stock Down Sort Dev** + Prisma + gitignored SQLite.
2. Staging — **VSN | Stock Down Sort Staging** + Prisma + isolated Neon PostgreSQL.
3. Production — **VSN | Stock Down Sort** + Prisma + isolated Neon PostgreSQL.

CI #271 passed Local SQLite schema validation, schema parity, SQLite migrations, Local client generation, hosted PostgreSQL schema validation, lint, typecheck, all contract tests, Worker build and both Cloudflare dry-runs.

## Current active work

`ISSUE-32-WU-LOCAL-SQLITE-01` — **verification_required**.

Remaining evidence is real Local runtime acceptance on the merged `development` source:

- create/clean `.env.local` with the dedicated Dev Shopify credentials and no Neon/hosted DB credentials;
- run `npm run local:prepare`;
- run `npm run dev`;
- verify `/healthz` reports development + SQLite + billing test mode;
- run `npm run local:certify -- <local-health-url>/healthz`;
- commit the exact acceptance evidence.

SQLite Local success is not PostgreSQL acceptance. Do not start Staging until the Local gate is accepted; Staging remains the first mandatory Neon/PostgreSQL runtime gate.
