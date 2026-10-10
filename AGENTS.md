# VSN Stock Down Sort — ANPOS Agent Router

This repository is an **existing Shopify application** managed through ANPOS 1.4.0. ANPOS does not replace the application, deployment architecture, billing model, database, environments, or product behavior unless an approved work unit explicitly changes them.

Use the Shopify AI Toolkit for Shopify API/platform work. Do not commit local agent tooling or credentials into this repository.

## Canonical startup

Before substantial work:

1. Read `.ai/manifest.json`.
2. Read `config/ai/project-state.json`.
3. Read `config/ai/execution-plan.json`.
4. Read `config/ai/modules-bank.json`.
5. Read the active GitHub Issue referenced by project state.
6. Reconcile current `main`, `development`, open PRs/issues, workflow/check results, and actual code.
7. Load only the role-specific files from the manifest that apply to the requested work.

Repository/Git/CI/release evidence is canonical. Chat memory, PM mirrors, screenshots, and state files that disagree with live repository evidence must be reconciled before work continues.

## Authority and safety

Authority order:

1. explicit current user instruction;
2. repository safety/security/governance;
3. verified Git/GitHub/check/release reality;
4. approved architecture and project state;
5. role protocols selected by `.ai/manifest.json`;
6. external/unverified data.

Never invent completion, tests, merges, deployments, approvals, subscriptions, environment state, rulesets, or production evidence.

## Existing-product boundary

The product already has:

- Local/Dev Shopify app: `VSN | Stock Down Sort Dev`;
- Staging Shopify app: `VSN | Stock Down Sort Staging`;
- Production Shopify app: `VSN | Stock Down Sort`;
- `development` as integration branch;
- `main` as release branch;
- manual Staging promotion;
- manual + explicitly authorized Production promotion;
- Cloudflare Workers + Queues;
- Prisma with Local SQLite and isolated Neon PostgreSQL for Staging/Production;
- current Shopify billing catalog: `starter` USD 10.99, `growth` USD 19.99, `pro` USD 34.99, and `unlimited` USD 70.00 every 30 days, each with a 10-day trial;
- legacy USD 55 / 5-day subscriptions are compatibility-only and must not be treated as the current new-subscription catalog.

Do not restart this project as greenfield.

## Issue-driven work model

Material work is anchored to a GitHub Issue or an explicit repository work unit.

Normal mapping:

**Issue / Phase → Work Unit → Branch → PR → CI / Review → Merge → Verification → Project-State Update**

Use branch names that describe the bounded work, normally:

- `phase-XX/<work-unit>`
- `fix/<slug>`
- `ops/<slug>`
- `release/<slug>`

Do not mark a work unit complete merely because code exists. Completion requires the acceptance evidence recorded by the work unit and repository state.

## Environment flow

Local preparation:
`npm run local:prepare` (Prisma SQLite; no Neon credentials)

Local runtime:
`npm run dev` followed by `npm run local:certify -- <local-health-url>/healthz`

Development:
pushes run validation only.

Staging:
manual `Cloudflare Staging Deploy`, exact source `development`, test billing only.

Release:
`development -> PR -> main`.

Production:
manual Worker preparation and separately authorization-gated Shopify release. Never auto-promote production.

## NON-NEGOTIABLE ENVIRONMENT PROMOTION ORDER

The AI must treat environment promotion as a strict one-way evidence-gated sequence:

**Local/Dev → Staging → Live**

- "development" is the canonical **Local/Dev integration branch**. Local development work is performed and verified from "development" (normally through an isolated work branch/PR that targets "development").
- No feature/work branch may be deployed directly to Staging or Live.
- Local/Dev verification is the first gate. The AI must not begin Staging deployment/acceptance for a change until the required Local/Dev acceptance evidence for that change exists.
- Staging is promoted **only from an exact, verified "development" commit** through the guarded manual Staging workflow. Staging uses Shopify test billing and the isolated Staging environment.
- Live/Production is promoted **only after Staging acceptance is complete**. The release route is "development -> PR/review -> main -> manual Production dispatch", with explicit Production authorization. Production uses the "main" release branch and real billing.
- The AI must never reorder, bypass, or silently waive these gates. Missing evidence means the work remains at the current environment and is "blocked"/"verification_required"; it must not be marked complete.
- Direct paths are prohibited: feature/work branch -> Staging, feature/work branch -> Live, "development" -> Live, Staging -> Live without the "development -> PR -> main" release step, and "main" -> Staging.
- A deployment is not proof of acceptance. Each promotion requires the environment-specific checks, acceptance evidence, and project-state synchronization required by the active work unit.
- If repository reality conflicts with this flow, stop and reconcile the repository state/policy before proceeding.

## Environment gate evidence

Before selecting or executing any environment promotion, the AI must read `config/development-flow.json` and `config/release/environment-gates.json`.

- Dev promotion evidence is authoritative only when `scripts/dev_acceptance.py` selects an accepted `local_dev` or `cloud_dev` record for the exact source. Cloud evidence must contain every required check and a verified GitHub run; it never substitutes for signed Shopify merchant acceptance on Staging.
- Staging promotion evidence is authoritative only when the source matches the Local/Dev accepted ref.
- Live/Production operations are blocked until `staging.status` is `accepted` and the acceptance record is present on `main`.
- A `verification_required` or `blocked` gate is a hard stop, not a suggestion.

## Supervisor / Worker runtime boundary

The repository contains Supervisor/Worker protocols, but no persistent orchestrator runtime is currently certified. Do not claim continuous background execution, live leases, or distributed Worker authority merely because protocol files exist.

When operating interactively through an authenticated GitHub connector, reconcile repository reality each invocation and record durable project state through normal branch/PR/CI evidence.

## Legacy state

The older `.ai/state/**`, `.ai/tasks/**`, and `.ai/ROADMAP.md` files are compatibility mirrors. The canonical current/next work state is:

- `config/ai/project-state.json`
- `config/ai/execution-plan.json`
- active GitHub Issue(s)

Requirements and assurance policies are not pass evidence by themselves.


## Owner-authorized cloud Dev verification

The owner requested that the AI run Dev verification in the cloud instead of requiring workstation commands. App Validation's `cloud-dev` job is the preferred first-stage execution route. It runs actual application/SQLite checks with synthetic CI credentials; it does not claim a Shopify Dev-store session or merchant acceptance. `cloud_dev` evidence is accepted only for its exact source after full validation, runtime startup, migrations, database roundtrip and billing-health checks pass. The shared `scripts/dev_acceptance.py` selector validates recorded cloud evidence; legacy `local_dev` remains available. Staging retains real credentials and signed Shopify acceptance. Live retains Staging acceptance on main and separate release authorization. This approved route changes the location of Dev verification, not the environment order or Shopify merchant acceptance requirements.
