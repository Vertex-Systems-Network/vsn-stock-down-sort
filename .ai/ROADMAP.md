# VSN Stock Down Sort — ANPOS Roadmap

## Phase 0 — Existing Repository Adoption
- Preserve the current Shopify application and operational architecture.
- Initialize ANPOS 1.4.0 child-project state.
- Establish repository-backed task, checkpoint, assurance, and roadmap state.

## Phase 1 — Local SQLite Conversion and Manual Staging Certification
- Convert Local/Dev on `development` to Prisma + SQLite under ADR-0001.
- Keep Staging and Production on Prisma + isolated Neon PostgreSQL.
- Add automated parity checks for shared Local/cloud Prisma models and required indexes.
- Certify the dedicated `VSN | Stock Down Sort Dev` app on Local SQLite.
- Treat Local SQLite acceptance as application-level evidence only; PostgreSQL acceptance starts in Staging.
- Manually dispatch Staging Readiness / Staging deployment when promotion is intended.
- Create/verify the staging Queue and DLQ inside the manual deploy workflow.
- Deploy the staging Worker from `development` only.
- Verify health, queue readiness, Neon PostgreSQL migrations, and test billing mode.
- Install/release the dedicated staging Shopify app and verify session/subscription reads.

## Phase 2 — Product Correctness & Reliability
- Audit sorting correctness and Shopify API limits.
- Audit queue retries, DLQ recovery, idempotency, concurrency, and webhook durability.
- Add stronger integration tests around collection ordering and large catalogs.
- Verify uninstall/privacy lifecycle and failure recovery.

## Phase 3 — Merchant UX & Operations
- Audit onboarding, Plans, collection controls, errors, empty states, progress feedback and support flows.
- Add operational dashboards/logging signals where justified.
- Improve staging-to-production promotion evidence and runbooks.

## Phase 4 — Security & Production Assurance
- Threat-model Shopify auth, billing, webhooks, database, Cloudflare bindings, GitHub Actions, and secrets.
- Review dependency/supply-chain posture.
- Complete release rollback/recovery evidence.
- Classify and satisfy applicable ANPOS Requirements 83–96.

## Phase 5 — Production Certification
- Production readiness.
- Isolated Worker preparation.
- Shopify production candidate.
- Explicit candidate authorization.
- Production release and post-release verification.
