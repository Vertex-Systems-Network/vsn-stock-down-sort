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

- Local/Dev Shopify app: `VSN Stock Down Sort Dev`;
- Staging Shopify app: `VSN Stock Down Sort Staging`;
- Production Shopify app: `VSN Stock Down Sort`;
- `development` as integration branch;
- `main` as release branch;
- manual Staging promotion;
- manual + explicitly authorized Production promotion;
- Cloudflare Workers + Queues;
- PostgreSQL/Prisma;
- Shopify billing contract: plan id `unlimited`, USD 55 / 30 days, 5-day trial.

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

Local:
`npm run dev`

Development:
pushes run validation only.

Staging:
manual `Cloudflare Staging Deploy`, exact source `development`, test billing only.

Release:
`development -> PR -> main`.

Production:
manual Worker preparation and separately authorization-gated Shopify release. Never auto-promote production.

## Supervisor / Worker runtime boundary

The repository contains Supervisor/Worker protocols, but no persistent orchestrator runtime is currently certified. Do not claim continuous background execution, live leases, or distributed Worker authority merely because protocol files exist.

When operating interactively through an authenticated GitHub connector, reconcile repository reality each invocation and record durable project state through normal branch/PR/CI evidence.

## Legacy state

The older `.ai/state/**`, `.ai/tasks/**`, and `.ai/ROADMAP.md` files are compatibility mirrors. The canonical current/next work state is:

- `config/ai/project-state.json`
- `config/ai/execution-plan.json`
- active GitHub Issue(s)

Requirements and assurance policies are not pass evidence by themselves.
