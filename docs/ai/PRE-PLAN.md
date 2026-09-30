# VSN Stock Down Sort — AI-Native Pre-Plan

This is the living project-specific decomposition required by the installed AI-Native Project Operating System. Repository/Git/test evidence outranks this document when facts diverge.

## 1. Product Objective

Build VSN Stock Down Sort into a Shopify inventory merchandising and automation suite that combines stock-first collection sorting, reversible visibility automation, variant control, low-stock notifications, rule-based automation, analytics and higher-tier Markets/B2B/integration capabilities.

Primary users are Shopify merchants and operators who need stock-aware merchandising without combining multiple single-purpose apps.

## 2. Scope

### In scope

- Four paid plans with stable IDs: `starter`, `growth`, `pro`, `unlimited`.
- Monthly prices: USD 10.99 / 19.99 / 34.99 / 54.99.
- Ten-day trial on every plan.
- No VSN-imposed product or collection count limits on these paid plans.
- Server-side feature entitlements.
- Stock-first sorting, restore, exclusions, pinning and advanced sort rules.
- Product soft-hide/hard-hide/republish flows.
- Sold-out variant hide/restore and multi-location semantics.
- Low/out-of-stock email and Slack alerts.
- Scheduled/delayed IF/AND/THEN automation.
- Analytics, activity history, error/retry/rollback surfaces and CSV exports.
- Shopify Markets, B2B catalogs, sales-channel rules and guarded integrations at higher tiers.
- Local -> Staging -> Production evidence gates.

### Out of scope / non-goals

- Claiming any planned feature is implemented before code/test evidence exists.
- Automatic Production deployment without explicit authorization.
- Reusing Local, Staging or Production identities/secrets.
- Artificial product/collection count caps for the four approved paid plans.

## 3. Current Repository Reality

- Existing implementation: stock-first collection sorting, manual/bulk controls, previous-order restore, inventory/product webhook triggers, Shopify billing foundation and Plans UI.
- Current runtime billing: legacy single `unlimited` plan at USD 55 every 30 days with 5-day trial. It is superseded as a product requirement but remains runtime truth until ISSUE-32-WU-BILLING-01 is implemented.
- Architecture: React Router Shopify app, Prisma/PostgreSQL, Cloudflare Worker/Queue pattern, dedicated environment configs.
- Branch model: `development` is active integration branch; `main` is guarded release baseline.
- Current environment work: Local/Dev Neon certification is still active; Staging/Production remain deferred.
- Development currently contains embedded billing redirect preservation at `7f41646e1b0075f7614b53cf26e24bea56a44554`.

## 4. Primary Actors and Workflows

- Merchant: selects plan, configures collections/rules/alerts, reviews history and recovers failed actions.
- Shopify webhooks: trigger inventory/product-driven automation.
- Queue worker: performs retryable/idempotent mutations.
- VSN operator: supports merchants and performs guarded Staging/Production promotion.
- AI Supervisor/Worker: resumes from repository-backed state, executes dependency-valid work units, verifies and synchronizes evidence.

## 5. Validated Requirements

- Exactly four stable commercial IDs: `starter`, `growth`, `pro`, `unlimited`.
- Every plan has a 10-day trial.
- Prices are USD 10.99, 19.99, 34.99 and 54.99 per 30 days.
- Feature differentiation, not product/collection counts, separates tiers.
- The approved detailed entitlement catalog is canonical in `config/ai/product-plan.json`.
- Local/Staging billing is test mode; Production is real billing only after guarded release.

## 6. Assumptions Still Requiring Validation

- Exact Shopify API behavior for every proposed variant/Markets/B2B visibility operation must be validated against current API capabilities before implementation.
- Slack/email delivery provider choices remain implementation decisions.
- SEO-safe hide semantics must be verified against the specific Shopify surfaces used; do not promise search-engine outcomes.

## 7. Constraints and Risks

- Shopify API rate limits and large-catalog reorder cost.
- Webhook duplication/out-of-order delivery.
- Visibility actions can be merchant-impacting and require reversible state/recovery evidence.
- Multi-location inventory can produce ambiguous availability without explicit aggregation rules.
- Legacy subscriptions must not silently map to an incorrect new entitlement tier.
- Staging must precede Production.

## 8. Approved Technology Decisions

- Frontend/app framework: current React Router Shopify application.
- Backend: current server routes/services plus Cloudflare Worker/Queue architecture.
- Data: Prisma + isolated PostgreSQL/Neon environments.
- Infrastructure: development Local/Dev, cloudflare-staging, cloudflare-production.
- Product planning/control plane: installed AI-Native Project Operating System / ANPOS repository-backed memory.
- Consent status: four-plan product direction approved; individual external provider choices remain evidence-driven.

## 9. Options Bank Summary

- Selected: all option IDs currently recorded in `config/ai/options-bank.json`.
- Rejected: none.
- Deferred: none at planning level; implementation remains dependency-gated.

## 10. Proposed Modules

Existing control/environment modules remain: `MOD-MGMT`, `MOD-LOCAL`, `MOD-STAGING`, `MOD-PRODUCTION`.

Product modules:
- `MOD-BILLING`
- `MOD-ENTITLEMENTS`
- `MOD-SORTING`
- `MOD-PRODUCT-VISIBILITY`
- `MOD-VARIANT-VISIBILITY`
- `MOD-ALERTS`
- `MOD-RULE-ENGINE`
- `MOD-ANALYTICS`
- `MOD-INTEGRATIONS`
- `MOD-MARKETS-B2B`

Canonical boundaries, dependencies, option attachments and acceptance criteria are in `config/ai/modules-bank.json`.

## 11. Phase / Milestone Strategy

1. PHASE-01 — Local-first environment certification + four-plan test billing contract + Staging gate.
2. PHASE-02 — Four-plan billing transitions and server-side entitlements.
3. PHASE-03 — Sorting and merchandising correctness.
4. PHASE-04 — Product visibility automation.
5. PHASE-05 — Variant and multi-location automation.
6. PHASE-06 — Inventory alerts and notifications.
7. PHASE-07 — Advanced automation rule engine.
8. PHASE-08 — Analytics, history and merchant operations.
9. PHASE-09 — Markets, B2B and integrations.
10. PHASE-10 — Security, scale and guarded Production certification.

The canonical dependency graph and work units are in `config/ai/execution-plan.json`.

## 12. Dependency and Critical-Path Notes

- Do not bypass `ISSUE-32-WU-LOCAL-01`.
- After Local certification, `ISSUE-32-WU-BILLING-01` replaces the legacy billing contract in test mode.
- Staging certification follows the new test billing contract.
- Advanced product phases depend on authoritative server-side entitlements.
- Production release remains the final guarded operation.

## 13. QA Strategy

- App Validation on every coherent change.
- Unit tests for entitlement and rule decisions.
- Integration tests for Shopify ordering, publication, variants and billing.
- Failure injection for queues, retries, notifications and visibility recovery.
- Large-catalog/rate-limit tests before Production.
- Exact Staging acceptance for all four plans before real billing release.

## 14. Security Strategy

- Server-side entitlement checks; never rely on UI gating.
- Verify Shopify webhook authenticity and idempotency.
- Keep Local/Staging/Production secrets and databases isolated.
- Protect notification/integration credentials.
- Require replay protection/auth/rate limits on integration surfaces.
- Minimize retained merchant/customer data.
- Threat model all destructive visibility and Production billing paths.

## 15. Deployment / Operations Implications

- Development branch validates application changes.
- Local uses dedicated Neon and Dev Shopify identity.
- Staging deployment is manual/guarded and uses Shopify test billing.
- Production preparation/release occurs only from verified evidence and requires explicit authorization.
- Rollback/recovery evidence is mandatory for merchant-impacting automation.

## 16. Unresolved Human Decisions

- External email delivery provider.
- Slack app/credential model.
- Exact API/integration commercial limits if later desired.
- Any future pricing or entitlement change beyond the approved catalog.

## 17. Execution Readiness

- [x] validated project objective exists
- [x] repository reality has been reconciled
- [x] system design direction is coherent
- [x] technology stack is already established
- [x] options bank is populated for known capabilities
- [x] modules bank has stable module IDs
- [x] module-option attachments are defined
- [x] phases/milestones are mapped to modules
- [x] modules are decomposed into verifiable work units
- [x] dependencies and blockers are visible
- [x] acceptance criteria and required checks exist
- [x] project state identifies the valid resume point

Execution remains blocked from advancing beyond the current work unit until Local/Dev certification evidence exists.
