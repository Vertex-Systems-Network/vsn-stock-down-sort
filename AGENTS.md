# Shopify app development

This app is scaffolded from a Shopify app template. See the README for framework-specific details.

Use the [Shopify AI Toolkit](https://shopify.dev/docs/apps/build/ai-toolkit) for all Shopify API and platform work. If missing, install it in the agent host per that page (or `npx skills add Shopify/shopify-ai-toolkit` for skill-compatible hosts) — do not add tooling to this repo.

# ANPOS child-project control plane

This repository has adopted ANPOS 1.4.0 as an **existing application**. The Shopify application, deployment architecture, billing, databases, environments, CI, and project-owned files predate ANPOS and remain authoritative project state.

Before substantial work:

1. Read `.ai/state/CURRENT-STATE.yaml`.
2. Read `.ai/state/LAST-CHECKPOINT.md`.
3. Read `.ai/tasks/INDEX.yaml`.
4. Read `.ai/ROADMAP.md`.
5. Reconcile with live GitHub branches, PRs, checks, and the actual code before mutating.
6. Treat repository evidence as stronger than stale chat memory.
7. Preserve existing application behavior unless the active task explicitly authorizes a change.
8. Use feature branches and PR validation for control-plane or application mutations.
9. Do not claim a requirement, release, security control, deployment, or assurance gate passed without evidence.
10. Requirements 83–96 are capability-aware; policy presence is not pass evidence.

Adoption mode: `existing_repository_adoption`.

Canonical upstream protocol:
`Vertex-Systems-Network/ai-native-project-operating-system`

Project repository:
`Vertex-Systems-Network/vsn-stock-down-sort`

The current application stack and deployment system are already selected and in use; ANPOS manages, audits, improves, and plans the existing product rather than restarting it from scratch.
