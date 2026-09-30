# VSN Stock Down Sort — ANPOS Roadmap

## Phase 0 — Existing Repository Adoption
- Preserve the current Shopify application and operational architecture.
- Maintain repository-backed task, checkpoint, assurance and roadmap state.
- Repository/Git/CI evidence outranks stale planning text.

## Phase 1 — Local / Four-Plan Billing / Staging Certification
- Complete Local/Dev certification on `development` with dedicated Neon.
- Replace the legacy runtime USD 55 / 5-day single plan with the approved test billing catalog:
  - `starter` — USD 10.99 / 30 days / 10-day trial
  - `growth` — USD 19.99 / 30 days / 10-day trial
  - `pro` — USD 34.99 / 30 days / 10-day trial
  - `unlimited` — USD 54.99 / 30 days / 10-day trial
- Keep Local/Staging billing in Shopify test mode.
- Manually certify Staging Worker, PostgreSQL, Queue/DLQ, Shopify auth/API and all four billing contracts.
- Do not deploy Production.

## Phase 2 — Billing & Entitlements
- Implement authoritative server-side plan entitlements.
- Implement upgrade/downgrade/cancel and legacy compatibility.
- Align Plans UI and feature-level upgrade prompts.

## Phase 3 — Sorting & Merchandising
- Certify large-catalog sorting and Shopify API-limit behavior.
- Add reversible restore, exclusions, pinning and advanced sort strategies.
- Harden queue retries, DLQ recovery, concurrency and idempotency.

## Phase 4 — Product Visibility
- Add SEO-safe soft hide where supported.
- Add hard hide/unpublish and automatic republish on restock.
- Add recovery/error evidence for merchant-impacting visibility actions.

## Phase 5 — Variant & Multi-Location
- Add sold-out variant hide/restore.
- Define and test location-aware inventory semantics.
- Cover variant edge cases and concurrent stock changes.

## Phase 6 — Alerts
- Add low/out-of-stock email alerts.
- Add Slack and scheduled digests for entitled plans.
- Certify deduplication, retries and delivery reliability.

## Phase 7 — Advanced Automation
- Add deterministic IF/AND/THEN rule builder.
- Add schedules, delays and chained recovery actions.
- Add conflict precedence and explainability.

## Phase 8 — Analytics & Operations
- Add dashboard and activity history.
- Add error center, retry and rollback controls.
- Add reports and CSV export.

## Phase 9 — Markets, B2B & Integrations
- Add supported Shopify Markets, B2B catalog and channel-aware rules.
- Add guarded API/webhook integrations.
- Certify enterprise-context isolation.

## Phase 10 — Security, Scale & Production Certification
- Threat-model auth, billing, webhooks, data, Cloudflare, Actions and integrations.
- Run large-catalog/rate-limit/failure certification.
- Run full Staging acceptance across four plans and implemented capabilities.
- Prepare/release Production only from exact certified evidence with explicit authorization.
