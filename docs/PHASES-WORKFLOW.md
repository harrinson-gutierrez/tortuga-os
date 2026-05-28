# Tortuga OS — Phases (F1..F7)

> Defines the seven phases of the consulting workflow, their owners, their gates, the artifact each one produces, and the transitions between them.
> Companion to [DOMAIN.md](./DOMAIN.md) and [REWORK-MODEL.md](./REWORK-MODEL.md).
>
> Note: this document is the **workflow** phases (the consulting process Tortuga orchestrates). For the **product roadmap** phases of Tortuga itself, see [PHASES.md](./PHASES.md).

---

## Overview

```
F1 Sales  →  F2 Kickoff  →  F3 Design  →  F4 Architecture  →  F5 Build  →  F6 QA + Deploy  →  F7 Handoff
(sales)      (pm)            (designer)    (tech_lead)         (dev)        (qa, devops)        (pm)
```

Each phase has:
- **One owner role** accountable for closing it.
- **One living document** that is the authoritative artifact (updated in place; history in git).
- **An exit gate**: an explicit condition that must be true to transition.
- **A rework loop**: how the phase reopens when something downstream points back to it.

---

## F1 — Sales / Quote

**Owner:** `sales`
**Living doc:** `01-sales/quote.md`
**Goal:** Translate client conversation into a concrete, costed, agentic-ready scope.

### Inputs
- Client conversation transcripts, briefs, references, links.

### Activities
1. Sales interviews the client and drafts the scope.
2. Sales decomposes scope into Stories using [STORY-FORMAT.md](./STORY-FORMAT.md).
3. Sales estimates hours per Story per Role.
4. System computes total_cost = Σ(hours × role.hourly_rate).
5. Quote v1 is sent.
6. Client either approves, requests changes (→ Quote v2), or rejects.

### Exit gate
- `quote.status = approved` (signed by client, captured as Evidence type `sales`, kind `signed_doc`).
- Every Story validates against STORY-FORMAT.md.

### Rework triggers
- Client requests changes → new Quote version under the same F1 phase, no cost penalty before approval.
- Downstream phase discovers requirement is wrong → ReworkTicket with `root_cause_phase=F1_SALES`, cost imputed back here.

### Anti-pattern guard
- A Story without verifiable acceptance criteria cannot leave F1. The system refuses to mark the Quote `approved` if any Story is vague.

---

## F2 — Kickoff / Planning

**Owner:** `pm`
**Living doc:** `02-kickoff/plan.md` (+ `cronograma.md`)
**Goal:** Convert the approved Quote into a dated execution plan.

### Inputs
- Approved Quote (Stories with hours).
- Team availability.
- Client constraints (deadlines, holidays, dependencies).

### Activities
1. PM schedules each Story onto a calendar.
2. PM identifies cross-story dependencies (e.g., F3 design must finish before F5 build).
3. PM allocates roles to stories.
4. PM and client agree on milestones and reporting cadence.

### Exit gate
- `plan.md` lists every Story with: start date, end date, assigned roles, dependencies.
- Client signs off on the cronograma (Evidence kind `signed_doc`).

### Rework triggers
- Scope discovered too large for the timeline → loop back to F1 to re-cost, then re-plan.
- Resource becomes unavailable → re-plan only; no F1 reopen unless scope changes.

---

## F3 — Design / Prototype

**Owner:** `designer`
**Living doc:** `03-design/design-approval.md` + Figma file
**Goal:** Lock the visual and interaction design before any code is written.

### Inputs
- Stories from approved Quote (especially their `inputs.brand`, `inputs.references`).
- Brand assets (logo, colors, type ramp) — see brandbook reference in memory.

### Activities
1. Designer produces Figma frames per Story.
2. Designer runs them by client; client either approves, asks for adjustments, or rejects.
3. Each cycle of feedback updates the same Figma file; `design-approval.md` logs decisions and dated approvals per Story.

### Exit gate
- Every Story has a Figma frame URL (with nodeId) recorded in `design-approval.md`.
- Client signs off explicitly per Story (a Story can be approved while others are still iterating).

### Rework triggers
- Client rejects a design → loop within F3, new iteration on the same frame.
- Build phase discovers design is infeasible → ReworkTicket with `root_cause_phase=F3_DESIGN`.

### Anti-pattern guard
- "Design A is canon" — see memory `feedback_design_a_canon.md`. The single Figma file referenced in `design-approval.md` is the only source of visual truth.

---

## F4 — Architecture

**Owner:** `tech_lead`
**Living doc:** `04-architecture/architecture.md` (+ `diagrams/`)
**Goal:** Decide HOW each story will be built, by whom, with what stack, against what contracts.

### Inputs
- Approved design (F3).
- Approved scope (F1) and plan (F2).

### Activities
1. Tech Lead picks stack per surface (app / api / web / infra).
2. Tech Lead authors data model, API contracts (OpenAPI), system diagrams.
3. Tech Lead generates scaffolds: API repo, front repo, web repo, infra repo as needed.
4. Tech Lead breaks each Story into Tasks with owner_role and estimated_hours.
5. Tech Lead writes the verification plan per Task (which gates run, what manual checks apply).

### Exit gate
- `architecture.md` documents: stack per surface, data model, API contracts, deployment topology, environments (dev/qa/prod).
- All scaffolds exist as repos (branch `main` initialized, CI green on empty scaffold).
- Every Story has its Tasks defined and gate plan recorded.

### Rework triggers
- F5 dev discovers contract is wrong → ReworkTicket with `root_cause_phase=F4_ARCHITECTURE`.
- Performance/security finding requires re-architecture → loop back here.

---

## F5 — Build

**Owner:** `dev` (one per task; many in parallel across tasks)
**Living doc per task:** `05-build/<STORY_ID>/tasks/<TASK_ID>/` (folder is the artifact)
**Goal:** Implement each Task to spec, with verifiable evidence.

### Per-task lifecycle
1. Dev reads `story.md` and the task's verification plan.
2. Dev implements.
3. Dev runs locally: unit tests, golden tests (Flutter/web), local smoke.
4. Sidecar runs gates G1..G7 as applicable to the task type (see verify-task.ts).
5. Dev produces dev-evidence: video of the flow (front), or swagger + curl log (api).
6. Dev opens PR to the QA branch with link to evidence.
7. Task transitions to `qa`.

### Exit gate (per task)
- All required gates `passed`.
- Evidence type `dev` attached with the right kind (`video` for front, `swagger`+`curl_log` for api).
- PR merged to QA branch.

### Rework triggers
- QA rejects → ReworkTicket with `root_cause_phase=F5_BUILD`, dev iterates (new iteration row), evidence updated.
- Defect surfaces in prod → ReworkTicket can re-impute to whichever phase actually caused it (often F1 or F4, sometimes F5).

### Anti-pattern guard (G6 enforcement)
- Cross-check: `git diff` of the iteration vs files declared by the dev. Zero artifact change with `approved` claim = automatic reject.
- See `feedback_code_standards.md`: code in English, zero filler comments, SOLID, pixel perfect.

---

## F6 — QA + Deploy

**Owner:** `qa` (for qa-tasks) → `devops` (for deploy-tasks)
**Living doc per task:** `06-qa-deploy/<STORY_ID>/<TASK_ID>/`
**Goal:** Independent validation, then deployment with verified evidence.

### QA sub-phase
1. QA reads the original `story.md` (the truth) and the dev's evidence.
2. QA verifies: criteria met, gates green, design matches Figma, build behaves as the story says.
3. QA produces qa-evidence (own video/screencaps/test runs).
4. QA either approves or rejects with a list of specific defects.

### Deploy sub-phase (only if QA approves)
1. DevOps deploys to prod (AWS/etc. as decided in F4).
2. DevOps runs prod smoke tests.
3. DevOps produces prod-evidence: smoke output, urls, version tag.

### Exit gate (per story)
- All QA Tasks for the Story `approved`.
- All Deploy Tasks for the Story `approved`.
- Prod smoke green; evidence attached.

### Rework triggers
- QA rejects → loops back to F5 (dev) with explicit defect list and ReworkTicket carrying the root cause phase.
- Deploy fails or prod smoke red → may loop to F5 (code bug), F4 (infra), or F2 (timing/scheduling).

---

## F7 — Client Handoff

**Owner:** `pm`
**Living doc:** `07-handoff/handoff.md`
**Goal:** Hand off the completed work, gather final client feedback, close the project.

### Activities
1. PM packages: prod URLs, credentials, repo access, documentation links.
2. PM walks client through what was delivered vs the original Quote (delta per Story).
3. Client either accepts, requests post-launch adjustments (new Quote, new project cycle), or rejects.

### Exit gate
- `handoff.md` complete with deliverables list.
- `client-acceptance.md` signed (Evidence kind `signed_doc`).
- Cost report generated: estimated vs actual hours per phase, rework cost imputed per root cause.

### Rework triggers
- Client finds a regression → ReworkTicket with root cause traced (usually F5 or F6).
- Client requests new scope → opens a new Project cycle (do not stretch F7).

---

## Gate matrix (which gates apply to which task type)

| Task type | G1 Analyze | G2 Arch | G3 Build | G4 Boot | G5 Fidelity | G6 Real Work | G7 A11y |
|---|---|---|---|---|---|---|---|
| `impl` (Flutter/web) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `impl` (api/backend) | ✓ | ✓ | ✓ | n/a | n/a | ✓ | n/a |
| `design` | n/a | n/a | n/a | n/a | client-approval | ✓ | n/a |
| `arch` | n/a | n/a | n/a | n/a | n/a | ✓ | n/a |
| `qa` | n/a | n/a | n/a | n/a | n/a | ✓ | n/a |
| `deploy` | n/a | n/a | ✓ (build artifact) | smoke-prod | n/a | ✓ | n/a |
| `docs` | n/a | n/a | n/a | n/a | n/a | ✓ | n/a |

G6 (Real Work) applies everywhere because every task must produce a non-empty artifact.
