# Tortuga OS — Roles

> The eight roles in the consulting workflow, what each one owns, and how their cost is computed.
> Companion to [PHASES.md](./PHASES.md) and [REWORK-MODEL.md](./REWORK-MODEL.md).

---

## The eight roles

| Role | Owns phase(s) | Approves | Reports to | Hourly rate (COP) |
|---|---|---|---|---|
| `sales` | F1 | — | client | TBD per project |
| `pm` | F2, F7 | F2 plan, F7 handoff | client | TBD |
| `designer` | F3 | — | pm | TBD |
| `tech_lead` | F4 | F4 architecture, F5 task plans | pm | TBD |
| `dev` | F5 (impl tasks) | — | tech_lead | TBD |
| `qa` | F6 (qa tasks) | F5 task closure | tech_lead | TBD |
| `devops` | F6 (deploy tasks) | deploys | tech_lead | TBD |
| `client` | — | F1 quote, F3 design, F7 handoff | — | n/a |

Rates default per role but can be overridden per project at kickoff (e.g., a friend partner billed at a discount, or a senior contractor billed at premium).

---

## Responsibilities in detail

### `sales`
- Owns the conversation with the client until the Quote is approved.
- Authors `01-sales/quote.md`.
- Writes Stories in agentic format (see [STORY-FORMAT.md](./STORY-FORMAT.md)).
- Estimates hours per Story per Role with the Tech Lead consulted if technical depth is needed.
- **Liability:** if a Story is vague or wrong and causes downstream rework, the rework cost is imputed to F1_SALES.

### `pm`
- Owns F2 (planning) and F7 (handoff).
- Authors `02-kickoff/plan.md`, `02-kickoff/cronograma.md`, `07-handoff/handoff.md`.
- Mediates between client and team during execution (does not author execution artifacts in F3..F6).
- **Liability:** if the plan over-commits and forces shortcuts, the resulting rework is F2_KICKOFF.

### `designer`
- Owns F3.
- Authors `03-design/design-approval.md`.
- Produces Figma frames; a frame URL + nodeId per Story is mandatory.
- Coordinates with client on design feedback cycles within F3.
- **Liability:** if F5 dev cannot reproduce the design because it is ambiguous, infeasible, or contradicts itself, rework is F3_DESIGN.

### `tech_lead`
- Owns F4.
- Authors `04-architecture/architecture.md` and the diagrams folder.
- Produces or oversees scaffold repos (api/front/web/infra).
- Breaks each Story into Tasks and defines the gate plan per Task.
- Approves PRs from devs into the QA branch.
- **Liability:** if F5 dev hits a wall because of bad API contracts, missing scaffold pieces, or wrong stack choice, rework is F4_ARCHITECTURE.

### `dev`
- Owns implementation tasks in F5.
- Reads the story, implements, runs local gates, produces dev-evidence, opens PR.
- One Dev per Task (parallelizable across tasks).
- **Liability:** if the implementation diverges from the story or breaks something that was working, rework is F5_BUILD.

### `qa`
- Owns QA tasks in F6.
- Reads the original story (the truth) and the dev's evidence.
- Independently re-verifies; never trusts the dev's claim alone.
- Authors `06-qa-deploy/<STORY_ID>/<TASK_ID>/qa-evidence/`.
- Approves or rejects with a specific defect list.
- **Liability:** if QA approves something that later fails in prod or for the client, rework can be partially imputed to F6_QA_DEPLOY (the QA missed it) and partially to the originating phase.

### `devops`
- Owns deploy tasks in F6.
- Deploys to prod once QA approves.
- Runs prod smoke tests; produces prod-evidence.
- **Liability:** if a deploy bricks prod or smoke fails because of infra mistakes, rework is F6_QA_DEPLOY (deploy sub-phase).

### `client`
- External principal.
- Approves: Quote (F1), Design (F3), Handoff (F7).
- Can request changes at any approval gate (counts as new iteration, not as rework).
- **Liability:** if the client requests a change AFTER they previously approved, the rework cost is **not** imputed to any internal phase — it is logged as `client_initiated` rework with a separate cost code, billable as scope change.

---

## How cost is computed

For any logged work entry:
```
cost = hours × role.hourly_rate
```

For a Story:
```
story.actual_cost = Σ across all tasks, all iterations: task_iteration.hours × role.hourly_rate
```

For a Project's profitability snapshot:
```
project.budget = quote.total_cost            (what was sold)
project.spent  = Σ all work entries          (what it actually took)
project.rework_cost = Σ all rework_tickets   (subset of spent, broken down by root cause)
project.client_rework_cost = Σ rework where root_cause = client_initiated  (billable as scope change)
```

The cost report at F7 always shows three lines per phase:
1. `original_estimated_hours` (from F1 Quote).
2. `actual_hours` (sum of all iterations including rework).
3. `rework_hours_caused_by_this_phase` (sum of ReworkTickets where `root_cause_phase` = this phase, regardless of where the rework was executed).

Line 3 is the accountability number. If F1_SALES caused 12 hours of dev rework, those 12 hours show under F1 in the cost report, not under F5.

See [REWORK-MODEL.md](./REWORK-MODEL.md) for the imputation rules in detail.

---

## Single-person and multi-role realities

In the current stage (solopreneur), one person may wear multiple roles. The system still tracks role per work entry, because:
1. The rate may differ per role even for the same person.
2. The audit of "where did the time go" is by role, not by person.
3. When partners/contractors join, the model already supports multi-person teams without schema changes.

A `client` role is never the same person as any internal role on the same project.
