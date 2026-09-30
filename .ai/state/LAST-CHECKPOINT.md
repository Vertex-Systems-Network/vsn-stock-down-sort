# Last Checkpoint

This file is a compatibility mirror. Canonical live state is:

- `config/ai/project-state.json`
- `config/ai/execution-plan.json`
- GitHub Issue #32
- live Git/PR/CI evidence

Verified management baseline:
- VSN Metafields-style repository management model is merged and CI-certified.
- Local, Staging, and Production remain separate Shopify identities.
- No automatic Staging or Production deployment is allowed.

Owner-directed environment order:
1. Local/Dev first on `development`.
2. Local/Dev uses a dedicated Neon PostgreSQL database.
3. Staging follows only after Local certification.
4. Staging GitHub Environment is `cloudflare-staging` (environment ID 23050370538).
5. Production GitHub Environment is `cloudflare-production` (environment ID 23098399859).

Current work:
`ISSUE-32-WU-LOCAL-01` — provision/bind `vsn-stock-down-sort-local`, configure pooled/direct Neon URLs locally, run Prisma migration and `npm run dev`, then record evidence.

Staging and Production remain deferred.
