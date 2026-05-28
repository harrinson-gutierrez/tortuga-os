# Tortuga OS — Domain Model

> Source of truth for entities, states, and relationships.
> Date: 2026-05-26 · Reset v3 — agentic consulting workflow.

---

## 0. Purpose

Tortuga OS is a **pure orchestrator** for a consulting workflow. It does not run LLMs internally. It models the end-to-end process from sales quote to client handoff, tracks every artifact, every iteration, and every hour, and imputes the cost of rework to the phase that caused it.

The system answers three questions at any moment:

1. **Where are we?** — current phase and gate status for every project.
2. **What is real?** — every artifact is a file with a known location, owner, and version.
3. **Where did the money go?** — every hour is logged against a phase, a role, and (if rework) a root cause.

---

## 1. Core entities

### Project

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `code` | text unique | Short slug, e.g. `GASTUU`, `CAM`. |
| `client_id` | fk → clients | |
| `status` | enum | `draft \| active \| paused \| closed_won \| closed_lost` |
| `started_at` | timestamp | First phase opened. |
| `closed_at` | timestamp nullable | F7 accepted by client. |

A Project has exactly seven Phases (F1..F7), created lazily as the previous one closes.

### Phase

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `project_id` | fk | |
| `type` | enum | `F1_SALES \| F2_KICKOFF \| F3_DESIGN \| F4_ARCHITECTURE \| F5_BUILD \| F6_QA_DEPLOY \| F7_HANDOFF` |
| `status` | enum | `pending \| in_progress \| approved \| rejected \| rework` |
| `iteration` | int | Counter of full phase reworks (starts at 1). |
| `owner_role` | enum | The role accountable for closing the gate. |
| `started_at` | timestamp | |
| `closed_at` | timestamp nullable | |
| `artifact_path` | text | Path to the single living document of this phase. |

A Phase always has exactly **one living document** under `tortuga-projects/<code>/<phase>/`. Updates rewrite the same file; history lives in git. No intermediate files, no "feedback v2.docx".

### Quote

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `phase_id` | fk → phases (F1) | |
| `version` | int | 1, 2, 3… each time client requests changes. |
| `status` | enum | `draft \| sent \| changes_requested \| approved \| rejected` |
| `total_hours` | decimal | Sum of estimated_hours from stories. |
| `total_cost` | decimal | hours × role hourly_rate aggregated. |
| `approved_at` | timestamp nullable | |

A Quote is the parent of Stories. When the client requests changes, version increments; previous version is preserved for audit.

### Story

The atomic unit of scope. Agentic-ready: a story is a self-contained brief that an agent (human or AI) can execute without re-asking the orchestrator.

| Field | Type | Notes |
|---|---|---|
| `id` | text | Format: `<PROJECT>-<NNN>`, e.g. `GASTUU-014`. |
| `quote_id` | fk | |
| `title` | text | Short imperative, e.g. "Implementar login con email/password". |
| `goal` | text | Natural-language outcome. |
| `acceptance_criteria` | json array | Each item verifiable (see STORY-FORMAT.md). |
| `inputs` | json | Figma nodeId, API contract, design tokens, sample data. |
| `outputs` | json | Expected artifacts: file paths, endpoints, evidence types. |
| `verification` | json | Gates to run (G1..G7) + manual checks. |
| `estimated_hours` | decimal | |
| `actual_hours` | decimal | Sum across all iterations of all tasks. |
| `status` | enum | `pending \| in_progress \| qa \| approved \| rejected` |
| `priority` | int | 1=highest. |

See [STORY-FORMAT.md](./STORY-FORMAT.md) for the canonical YAML+MD schema.

### Task

A Story breaks into Tasks. A Task is owned by a single role and produces one set of artifacts in one iteration cycle.

| Field | Type | Notes |
|---|---|---|
| `id` | text | `<STORY_ID>-T<n>`, e.g. `GASTUU-014-T1`. |
| `story_id` | fk | |
| `type` | enum | `impl \| design \| arch \| qa \| deploy \| docs` |
| `owner_role` | enum | One of the 8 roles. |
| `assignee` | text | Person identifier. |
| `status` | enum | `pending \| in_progress \| qa \| approved \| rejected \| rework` |
| `current_iteration` | int | Starts at 1. |
| `estimated_hours` | decimal | |
| `actual_hours` | decimal | |

### Iteration

Every attempt at closing a task is an Iteration. Reworks always create a new iteration, never overwrite the previous one.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `task_id` | fk | |
| `n` | int | 1, 2, 3… |
| `started_at` | timestamp | |
| `closed_at` | timestamp nullable | |
| `outcome` | enum | `approved \| rejected \| rework_requested` |
| `closed_by_role` | enum | Who closed it (QA, Client, etc.). |
| `notes` | text | Why it was closed this way. |

### ReworkTicket

When an iteration ends in rework, a ReworkTicket is created. This is the entity that carries the **cost imputation** rule.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `iteration_id` | fk | The iteration that triggered the rework. |
| `triggered_by_phase` | enum | Phase where the defect was detected (e.g. F6_QA_DEPLOY). |
| `root_cause_phase` | enum | Phase that produced the defect (e.g. F1_SALES if requirement was wrong). |
| `root_cause_role` | enum | Role that produced the defect. |
| `description` | text | What went wrong. |
| `hours_spent` | decimal | Hours of the rework itself. |
| `cost` | decimal | hours × root_cause_role hourly_rate. |
| `created_at` | timestamp | |

See [REWORK-MODEL.md](./REWORK-MODEL.md) for the imputation algorithm.

### Evidence

Every iteration must close with evidence. Evidence is immutable once attached.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `iteration_id` | fk | |
| `task_id` | fk | Denormalized for fast lookup. |
| `type` | enum | `dev \| qa \| prod \| design \| arch \| sales` |
| `kind` | enum | `video \| image \| pdf \| swagger \| curl_log \| screencap \| gate_output \| signed_doc` |
| `path` | text | Relative path inside the project repo. |
| `created_by` | text | Role + assignee. |
| `created_at` | timestamp | |
| `notes` | text | |

See [EVIDENCE-SCHEMA.md](./EVIDENCE-SCHEMA.md) for the on-disk layout.

### Gate

A Gate is a verification step run by the sidecar (objective) or by a reviewer (subjective). Reuses the G1..G7 family from the previous design but is now anchored to a Task (not a step).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `task_id` | fk | |
| `iteration_id` | fk | |
| `gate_type` | enum | `G1_ANALYZE \| G2_ARCH \| G3_BUILD \| G4_BOOT \| G5_FIDELITY \| G6_REAL_WORK \| G7_A11Y` |
| `status` | enum | `pending \| passed \| failed \| skipped` |
| `output_path` | text | File with full stdout/stderr or judge rationale. |
| `ran_at` | timestamp | |

A Task cannot transition to `qa` until all required gates for its type are `passed`. A QA Task cannot transition to `approved` until the QA reviewer signs off.

### Role & Assignment

| Role | Default hourly rate (COP) | Phases owned |
|---|---|---|
| `sales` | TBD | F1 |
| `pm` | TBD | F2, F7 |
| `designer` | TBD | F3 |
| `tech_lead` | TBD | F4 |
| `dev` | TBD | F5 (impl tasks) |
| `qa` | TBD | F6 (qa tasks) |
| `devops` | TBD | F6 (deploy tasks) |
| `client` | n/a | Approves F1, F3, F7 |

Rates are set per project at kickoff (can override defaults). See [ROLES.md](./ROLES.md).

---

## 2. State machine (high-level)

```
Project
  └── F1_SALES (sales)
       └── Quote v1, v2... → approved → unlock F2
  └── F2_KICKOFF (pm)
       └── plan.md + cronograma → signed → unlock F3
  └── F3_DESIGN (designer)
       └── Figma link + design-approval.md → client approved → unlock F4
  └── F4_ARCHITECTURE (tech_lead)
       └── architecture.md + diagrams + scaffolds → unlock F5
  └── F5_BUILD (dev, per task)
       └── Task[impl] → gates G1..G7 pass → status=qa → unlock F6 for that task
  └── F6_QA_DEPLOY (qa → devops, per task)
       └── Task[qa] → approved → Task[deploy] → smoke prod green → unlock F7 for that story
  └── F7_HANDOFF (pm)
       └── handoff.md + client_acceptance → project.status=closed_won
```

Each phase has a single living document. Each task inside F5/F6 has its own evidence folder. Reworks loop within their owning phase but **cost is imputed to the root cause phase**, not to the phase doing the rework.

---

## 3. Invariants

1. A Project has exactly 0 or 1 Phase of each type at any moment (no parallel phases of the same type).
2. A Phase cannot transition to `approved` until its predecessor (by F-number) is `approved`. Exception: F5 and F6 run in pipeline per task, but F4 must be approved before any F5 task starts.
3. Every Task in `approved` state has exactly one `Evidence` row of the type matching its phase (`dev` for F5 impl, `qa` for F6 qa, `prod` for F6 deploy).
4. Every Iteration with `outcome=rework_requested` has exactly one ReworkTicket.
5. `actual_hours` on Story = sum of `actual_hours` of all its Tasks across all iterations.
6. A Quote can only be `approved` once; further changes create a new Quote version under the same F1 Phase.

---

## 4. What lives where on disk

```
tortuga-projects/<PROJECT_CODE>/
  01-sales/
    quote.md                 ← F1 living document
    quote-history/           ← old approved versions, frozen
  02-kickoff/
    plan.md                  ← F2 living document
    cronograma.md
  03-design/
    design-approval.md       ← F3 living document
    figma-links.md
  04-architecture/
    architecture.md          ← F4 living document
    diagrams/
    scaffolds/
  05-build/
    <STORY_ID>/
      story.md               ← agentic story brief (immutable once approved)
      tasks/
        <TASK_ID>/
          dev-evidence/      ← screenshots, video, swagger, curl logs
          gate-outputs/      ← G1..G7 raw outputs
  06-qa-deploy/
    <STORY_ID>/
      <TASK_ID>/
        qa-evidence/
        prod-evidence/
        deploy-log.md
  07-handoff/
    handoff.md               ← F7 living document
    client-acceptance.md
```

The orchestrator's SQLite DB tracks state; the filesystem holds the artifacts. The two must always agree — `verify-task.ts` audits the gap.

---

## 5. Out of scope (intentionally)

- Multi-tenant. Single solopreneur installation.
- Real-time collaboration. Single-writer at a time.
- LLM execution inside the orchestrator. Agents (human or AI) act externally and write artifacts; Tortuga reads them.
- Billing/invoicing automation. The system produces a cost report; invoicing happens elsewhere.
