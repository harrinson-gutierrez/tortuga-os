# Tortuga OS — Rework & Cost Imputation Model

> How retries are tracked, who pays for them, and how the cost flows back to the phase that caused the defect.
> This is the central problem the v3 reset solves.

---

## Why this exists

In a consulting workflow, **the cost of fixing a defect is rarely paid by the phase that caused it.** A vague story (F1) becomes a wrong design (F3) becomes a wasted week of dev (F5). If you only track time per task, every hour of that wasted week looks like "Dev was slow." It wasn't. Sales sold something ambiguous.

The rework model fixes that by separating two concepts:
- **Where the work was done** (the executing phase).
- **Where the defect originated** (the root cause phase).

Cost is tracked under both. The total stays the same; the accountability becomes legible.

---

## Core principle

> Every hour of work is logged against:
> 1. The Task / Iteration / Role that did the work (always).
> 2. If that work is rework: the root_cause_phase and root_cause_role that produced the original defect.

Original work: `(executing_phase, executing_role)` only.
Rework: `(executing_phase, executing_role) + (root_cause_phase, root_cause_role)`.

The cost report rolls up by root_cause_phase to answer: "where did the money go that should not have gone there?"

---

## What counts as rework

| Situation | Rework? | Root cause |
|---|---|---|
| Client rejects Quote v1, asks for changes before approving | **No** | F1 is not "done" yet; just iterating. |
| Client approves Quote, then later requests scope change | **Yes**, `client_initiated` | Logged as scope change, billable. |
| Client rejects design in F3 | **No (within phase)** | Same Phase, new iteration. Normal F3 cost. |
| F5 dev cannot implement a story because the design contradicts itself | **Yes** | F3_DESIGN |
| F5 dev cannot implement because the API contract is wrong | **Yes** | F4_ARCHITECTURE |
| F5 dev implements wrong because they misread the story | **Yes** | F5_BUILD |
| F5 dev implements wrong because the story is vague | **Yes** | F1_SALES |
| QA finds a defect that matches the story exactly | **Yes** | F5_BUILD |
| QA finds a defect that the story does NOT specify either way | **Yes** | F1_SALES (incomplete criteria) |
| Prod smoke fails because deploy script was wrong | **Yes** | F6_QA_DEPLOY |
| Prod smoke fails because of a bug in code that QA missed | **Yes (split)** | Primary: F5_BUILD. Secondary attribution: F6_QA_DEPLOY (QA missed it). |
| Client finds a regression in F7 | **Yes** | Trace to actual cause (usually F5, sometimes F1). |

The defining test: **would the rework hours have happened if the upstream phase had done its job correctly?** If no → that phase is the root cause.

---

## The imputation algorithm

When an iteration closes with `outcome = rework_requested`:

1. **Reviewer creates a ReworkTicket** with:
   - `iteration_id` = the iteration that just closed.
   - `triggered_by_phase` = the phase where the defect was detected.
   - `root_cause_phase` = the phase the reviewer believes caused it (one of F1..F6 or `client_initiated`).
   - `root_cause_role` = the role within that phase.
   - `description` = specific defect + why root cause is this phase.

2. **The new iteration starts.** Dev (or whoever) does the rework. Hours accumulate on this new iteration normally.

3. **When the new iteration closes**, the system reads the ReworkTicket and re-tags those hours: the cost is **still paid out of the executing role's budget** (i.e. Dev is paid for the time), but in reports it's attributed to the root_cause_phase column.

4. **The aggregate rolls up at F7**: cost report shows per phase its `clean_hours` (original work, no rework) and `rework_hours_attributed` (work done to fix defects this phase caused, executed by other phases).

### Pseudocode

```typescript
function computeCostReport(projectId: string) {
  const phases = getPhases(projectId)
  return phases.map(p => ({
    phase: p.type,
    clean_hours:
      sumHours(p, { iteration: 1, no_rework_tickets_pointing_here: true }),
    rework_hours_caused:
      sumHours({ rework_tickets_where: { root_cause_phase: p.type } }),
    total_cost_attributed:
      sumCost({ phase: p, plus_rework_attributed_to: p })
  }))
}
```

---

## Reviewer guidance for assigning root cause

QA, Tech Lead, and PM are the most common reviewers. To keep imputation honest, the reviewer must answer **three questions** before creating a ReworkTicket:

1. **What is the defect, in one sentence?**
2. **What artifact should have prevented it?** (the quote? the design? the contract?)
3. **Is that artifact wrong/incomplete, or was it ignored?**
   - If wrong/incomplete → root cause = the phase that produced it.
   - If correct but ignored → root cause = the phase that ignored it (usually F5 or F6).

If the reviewer cannot answer #2 — "no artifact would have prevented this, we just didn't know" — that almost always points to F1_SALES (acceptance criteria too thin) or F4_ARCHITECTURE (architecture didn't cover this case).

The system enforces that `description` is non-empty and contains a path to the artifact in question.

---

## Edge cases

### Split causes

Sometimes a defect has two root causes. Example: a deploy fails because (a) the dev introduced a bug AND (b) QA didn't catch it. Two ReworkTickets are created against the same iteration:
- Ticket A: root_cause = F5_BUILD, weight = 0.7
- Ticket B: root_cause = F6_QA_DEPLOY, weight = 0.3

Total weight across tickets for one rework must sum to 1.0. The system enforces this constraint.

### Client-initiated changes after approval

Tracked under `root_cause_phase = client_initiated`. These hours are billable to the client as scope change, not absorbed by the team. They appear in the cost report under a separate line. This protects the team's accountability metrics from being contaminated by client churn.

### Re-rework (rework of rework)

If iteration 3 reworks something that iteration 2 reworked, the ReworkTicket for iteration 3 imputes to **the original** root cause if the same defect persists, OR to F5_BUILD if the dev's attempt introduced a new problem. The reviewer must distinguish.

---

## Why this matters for the consulting business

After a few projects, the cost report gives:

- **Per-phase reliability score** = clean_hours / (clean_hours + rework_hours_caused). A phase consistently scoring below 0.8 has a process problem.
- **Pricing calibration** = if F1_SALES consistently causes 20% rework, the Quote must be priced with a 20% buffer until the process improves.
- **Role coaching signal** = a sales person whose Quotes consistently cause F5 rework needs better story-writing practice, not faster typing.
- **Client conversation** = at F7, you can show the client exactly where time went and which scope changes they introduced, with numbers. No arguments.

The rework model is the difference between Tortuga being a task tracker and Tortuga being a business intelligence system for a consultancy.
