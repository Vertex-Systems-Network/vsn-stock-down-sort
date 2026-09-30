# Last Checkpoint

This file is a compatibility mirror. Canonical live state is:

- `config/ai/project-state.json`
- `config/ai/execution-plan.json`
- GitHub Issue #32
- live Git/PR/CI evidence

Verified environment-topology completion:
- PR #37 App Validation run `36698394720` passed all checks on certified Git tree `fc6e44bf74de24f2d68890136bf75cd55069fe8c`.
- PR #37 merged to `development` as `d90dd87de3ca6605a7d97e3f7c8e9f592811c732`.
- PR #38 promoted the identical certified tree to protected `main` as `c0320d5bcbb1057bd6100253e1b0664843ed0404`.
- `development` was fast-forwarded to the same protected-main baseline.
- Staging and Production were not deployed.

Canonical environment order:
1. Local/Dev — `development` + **VSN Stock Down Sort Dev** + dedicated Neon PostgreSQL.
2. Staging — GitHub Environment `cloudflare-staging` (ID `23050370538`) + manual deployment.
3. Production — GitHub Environment `cloudflare-production` (ID `23098399859`) + manual/authorized deployment.

Current active work:
`ISSUE-32-WU-LOCAL-01` remains **in progress**.

Remaining Local blocker:
- provision/bind the real Neon project `vsn-stock-down-sort-local`;
- record project/branch/endpoint identity;
- configure pooled `DATABASE_URL` + matching direct `DIRECT_URL` in the uncommitted local `.env`;
- run Prisma migrations and `npm run dev`;
- prove the Dev Shopify app opens successfully.

Do not start Staging until that Local evidence exists.
