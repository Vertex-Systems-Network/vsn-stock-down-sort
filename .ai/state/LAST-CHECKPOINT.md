# Last Checkpoint

This file is a compatibility mirror. Canonical live state is:

- `config/ai/project-state.json`
- `config/ai/execution-plan.json`
- `config/ai/product-plan.json`
- GitHub Issue #32
- live Git/PR/CI evidence

## Verified environment baseline

- Local-first environment topology is present in the guarded repository flow.
- `development` contains the latest embedded billing redirect preservation at `7f41646e1b0075f7614b53cf26e24bea56a44554`.
- Staging and Production have not been deployed.
- Active work remains `ISSUE-32-WU-LOCAL-01`.

## Owner-approved product-plan reconciliation

The AI-Native planner now carries the future four-plan commercial contract:

- `starter` — USD 10.99 / 30 days / 10-day trial
- `growth` — USD 19.99 / 30 days / 10-day trial
- `pro` — USD 34.99 / 30 days / 10-day trial
- `unlimited` — USD 54.99 / 30 days / 10-day trial

All four paid plans are planned without VSN-imposed product/collection count limits. Capability differentiation is canonical in `config/ai/product-plan.json`.

This does **not** claim the runtime billing code has changed. The current legacy single-plan runtime contract remains implementation truth until `ISSUE-32-WU-BILLING-01` passes.

## Resume rule

1. Finish Local Neon binding, migrations and Dev Shopify boot evidence.
2. Implement/certify `ISSUE-32-WU-BILLING-01` in Shopify test mode.
3. Continue Staging secret/readiness/deploy/acceptance gates.
4. Advance into PHASE-02+ only through dependency-valid work units.
