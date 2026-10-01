# Last Checkpoint

This file is a compatibility mirror. Canonical live state is:

- `config/ai/project-state.json`
- `config/ai/execution-plan.json`
- `config/architecture/decision-records.json`
- GitHub Issue #32
- live Git/PR/CI evidence

## Latest verified repository baseline

- Development head before this planning change: `c90dd8c67704a2842c0eb065549a8cb7834975e7`.
- App Validation #265 passed the latest canonical Local registry/runbook tree before PR #62 merged.
- Staging and Production have not been promoted by this planning change.

## Accepted target architecture — ADR-0001

1. Local/Dev — `development` + **VSN | Stock Down Sort Dev** + Prisma + gitignored SQLite.
2. Staging — `cloudflare-staging` + Prisma + isolated Neon PostgreSQL + test billing.
3. Production — `cloudflare-production` + Prisma + isolated Neon PostgreSQL + real billing.

The earlier Local-Neon work remains historical evidence but is superseded as the future Local target.

## Current active work

`ISSUE-32-WU-LOCAL-SQLITE-01` — **in progress**.

Implementation must:

- make `prisma/schema.prisma` the Local SQLite schema;
- preserve `prisma/cloud/schema.prisma` for hosted PostgreSQL;
- remove normal Local dependence on `NEON_API_KEY`, `NEON_PROJECT_ID`, hosted `DATABASE_URL` and `DIRECT_URL`;
- keep the Local SQLite database file gitignored;
- add Local/cloud schema-parity checks;
- certify `npm run dev` against **VSN | Stock Down Sort Dev**;
- keep Staging blocked until Local SQLite acceptance evidence exists.

Do not claim the runtime is converted until the implementation PR is merged and verified.
