# Skill — Scoping & Estimation

**Activate when**: agent role is `scoping-architect`, OR you are
producing/auditing a quote or estimate for a project or module.

Disciplined scoping for 2026. The goal is a quote that survives contact
with reality: defensible numbers, explicit assumptions, and a structure
that lets Tortuga compare estimate vs real tracked hours afterward.

## Dimension the work before pricing it

- **Never quote before you understand the domain.** If you can't
  describe the data model, the actors, and the top 5 user flows, you are
  guessing. Run discovery first.
- Decompose top-down: **project → modules → deliverables → tasks**. A
  task you can't estimate is a task you don't understand — split it until
  each leaf is ≤ ~2 days of work.
- Each module must map to something the client recognizes as value
  (e.g. "Auth & onboarding", "Quote builder", "Billing"). Internal
  plumbing rolls up into the module it serves.
- Tag every task with **type**: build, integration, data/migration, QA,
  infra/deploy, discovery, review. Tortuga tracks real time per module
  and per type — keep the breakdown so calibration is possible later.

## Estimation techniques (pick by uncertainty)

- **Analogous / historical** — anchor to a similar past module and its
  *actual* tracked hours. This is the strongest estimator Tortuga can
  give you; query past projects before inventing a number.
- **Three-point PERT** — for each item gather optimistic `O`, most
  likely `M`, pessimistic `P`. Estimate `E = (O + 4M + P) / 6`,
  std-dev `σ = (P − O) / 6`. Sum `E` across items; combine variance as
  `√Σσ²` to get a project-level confidence band, not a single number.
- **T-shirt sizing (S/M/L/XL)** — fast first pass to triage scope and
  flag the XLs that need decomposition before any number is committed.
- **Story points vs hours** — points measure *relative complexity* and
  are great for internal velocity, but a client quote is settled in
  **hours/money**. Convert points→hours only via your own historical
  velocity, never a generic ratio.

## Cone of uncertainty

- Early (pre-discovery) estimates are realistically **0.25×–4×** the
  true cost. After discovery they tighten to roughly **0.8×–1.25×**.
- Present early numbers as a **range tied to a confidence level**, never
  a single figure. If a single number is demanded, give the upper band.
- The cone only narrows by *doing work* (discovery, spikes, prototypes).
  You cannot tighten an estimate by thinking harder about unknowns.

## Buffers & contingency

- Add a **contingency buffer** sized to remaining uncertainty:
  ~15% for well-known work, **25–40%** for novel/integration-heavy work.
- Buffer is for *known unknowns* (the bug-fix tail, integration
  surprises). It is **not** a discount lever — don't shave it to win the
  deal; re-scope instead.
- Keep buffer **visible and labeled** in the internal estimate even if
  it's folded into the client number. You can't calibrate a buffer you
  hid from yourself.

## What is chronically UNDER-estimated

Add explicit line items for these — they are the usual reason a project
blows its number:

1. **Discovery & domain learning** — requirements, edge cases, ramp-up.
2. **QA & testing** — typically **15–30%** of build time, not zero.
3. **Integration** — third-party APIs, auth, payments, webhooks always
   cost more than the happy path suggests.
4. **Deployment & infra** — environments, CI/CD, secrets, DNS, rollback.
5. **Code review & rework** — review cycles and the changes they trigger.
6. **Bug-fix tail** — stabilization after "feature complete".
7. **Non-coding work** — meetings, demos, status, comms, PM overhead
   (often **10–20%** of total).

## Discovery vs build — separate them

- Sell **discovery as its own paid milestone** (fixed, small) that
  *produces* the build estimate. This is how you legitimately narrow the
  cone before committing to a build number.
- If the client refuses discovery, the build quote must be a wide range
  with a fat buffer, and that trade-off stated in writing.

## Milestones as billing units

- Structure the quote as **milestones that are independently
  demonstrable and billable** (deliverable-based, not date-based).
- Each milestone = a module or coherent slice the client can accept and
  pay for. This protects cash flow and bounds risk per phase.
- Tie payment to **acceptance of a deliverable**, never to elapsed time.

## Scope creep & change requests

- The quote names an explicit **scope boundary** plus a short
  **out-of-scope** list. Anything outside it is a **change request**:
  re-estimated, re-priced, re-approved before work starts.
- "Small tweaks" accumulate — log every change request even when you
  decide to absorb it, so the actuals stay honest.

## The feedback loop (estimate vs actuals)

Tortuga records **real billable time per module/type**. Close the loop:

- After delivery, pull actual hours per module and compute the
  **estimation ratio** `actual / estimate` for each.
- Persistent ratios > 1 reveal *which categories* you under-estimate
  (almost always QA, integration, discovery). Adjust those multipliers
  in future quotes.
- Feed actuals back as the historical anchor for the next analogous
  estimate. **An estimate never compared to actuals never improves.**
- Track **margin realized** vs quoted; a module that hit its hours but
  blew its margin means the rate or buffer was wrong, not the estimate.

## Red flags of an under-scoped proposal (audit checklist)

- **Projected margin below target (~30%)** — under-priced or
  under-buffered. Refuse to ship it.
- **No discovery milestone** on novel/complex work.
- **No QA line item** (or QA folded invisibly into "dev").
- **Timeline implies > ~6 focused hrs/day per person** sustained.
- **Single-point numbers** with no range, no buffer, no assumptions.
- **No integration/deploy line items** despite external dependencies.
- **No out-of-scope list** / no change-request clause.

## Anti-patterns to refuse

1. **Estimating only the happy-path build** — omitting QA, integration,
   deploy, review, bug-fix tail. The number is fiction.
2. **No buffer / contingency** — pretending zero unknowns remain.
3. **Skipping discovery** then quoting a fixed build price as if certain.
4. **Single-point estimate presented as certainty** — drop the range and
   you've made a promise you can't keep.
5. **Ignoring non-coding work** — meetings, PM, comms cost real hours.
6. **Never calibrating against actuals** — quoting forever from gut with
   no feedback loop, so the same errors repeat every project.
7. **Quoting before understanding the domain** — a number without a model
   of the work is a guess wearing a tie.

## Common gotchas

1. **Padding ≠ buffer.** Silently inflating each task hides where the
   risk is and corrupts your historical data. Estimate honestly, then
   add a *labeled* contingency line.
2. **Summing optimistic estimates is pessimistic in aggregate.** Per-task
   bests rarely all land; PERT variance (`√Σσ²`) gives a realistic band.
3. **Velocity is per-team, per-context.** Borrowing another team's
   points→hours ratio, or last year's velocity after staffing changes,
   produces confidently wrong numbers.
4. **Fixed price + vague scope = you eat the overrun.** Either the scope
   is locked tight or the contract is time-and-materials. Don't mix the
   risk profiles.

## Reference repos

See `sources.json`. Highlights: estimation/PERT references, agile sizing
guides, and the cone-of-uncertainty literature.
