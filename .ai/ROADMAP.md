# VSN Stock Down Sort — ANPOS Roadmap

## Phase 0 — Existing Repository Adoption
- Preserve the current Shopify application and operational architecture.
- Initialize ANPOS 1.4.0 child-project state.
- Establish repository-backed task, checkpoint, assurance, and roadmap state.

## Phase 1 — Staging Certification
- Verify Cloudflare credentials and staging Queue/DLQ.
- Run Staging Readiness.
- Deploy the staging Worker.
- Verify health, queue readiness, PostgreSQL migrations, and test billing mode.
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
