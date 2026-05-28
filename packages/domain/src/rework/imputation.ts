/**
 * Rework cost imputation algorithm.
 *
 * Source of truth: docs/REWORK-MODEL.md.
 *
 * Core idea: every hour of rework is attributed to the phase that CAUSED
 * the defect, not the phase doing the rework. So a Dev fixing a bug whose
 * root cause is a vague Sales story imputes those hours under F1_SALES
 * in the cost report.
 *
 * Pure function. No IO. The caller provides the work entries, the rework
 * tickets they reference, and the per-role rate table. Returns one row
 * per phase plus the cross-cutting totals.
 */

import type { PhaseType, ReworkRootCause, Role } from '../values'
import { PHASE_TYPES } from '../values'

export interface WorkEntryInput {
  minutes: number
  role: Role
  /** When non-null this entry is rework; the ticket carries the imputation. */
  reworkTicketId: string | null
  /** The phase under which this entry's iteration ran. Used for clean-work attribution. */
  executingPhase: PhaseType
}

export interface ReworkTicketInput {
  id: string
  rootCausePhase: ReworkRootCause
  rootCauseRole: Role
  /**
   * Weight in basis points (0..10000). Multiple tickets per iteration must
   * sum to 10000. Used when a defect has split causes.
   */
  weight: number
}

export type RateLookup = (role: Role) => number

export interface PhaseBreakdown {
  phase: PhaseType
  cleanMinutes: number
  cleanCostCents: number
  reworkAttributedMinutes: number
  reworkAttributedCostCents: number
}

export interface CostReport {
  byPhase: PhaseBreakdown[]
  spentCents: number
  reworkCostCents: number
  clientReworkCostCents: number
}

function makeAccumulators(): Map<PhaseType, PhaseBreakdown> {
  const out = new Map<PhaseType, PhaseBreakdown>()
  for (const p of PHASE_TYPES) {
    out.set(p, {
      phase: p,
      cleanMinutes: 0,
      cleanCostCents: 0,
      reworkAttributedMinutes: 0,
      reworkAttributedCostCents: 0,
    })
  }
  return out
}

function costOf(minutes: number, role: Role, rate: RateLookup): number {
  return Math.round((minutes / 60) * rate(role))
}

export function imputeReworkCost(
  workEntries: ReadonlyArray<WorkEntryInput>,
  reworkTicketsById: Readonly<Record<string, ReworkTicketInput>>,
  rate: RateLookup,
): CostReport {
  const acc = makeAccumulators()
  let spentCents = 0
  let reworkCostCents = 0
  let clientReworkCostCents = 0

  for (const entry of workEntries) {
    const fullCost = costOf(entry.minutes, entry.role, rate)
    spentCents += fullCost

    if (entry.reworkTicketId === null) {
      const phase = acc.get(entry.executingPhase)
      if (phase) {
        phase.cleanMinutes += entry.minutes
        phase.cleanCostCents += fullCost
      }
      continue
    }

    const ticket = reworkTicketsById[entry.reworkTicketId]
    if (!ticket) {
      // No ticket = treat as clean (defensive). Real validation happens in core.
      const phase = acc.get(entry.executingPhase)
      if (phase) {
        phase.cleanMinutes += entry.minutes
        phase.cleanCostCents += fullCost
      }
      continue
    }

    reworkCostCents += fullCost

    if (ticket.rootCausePhase === 'client_initiated') {
      clientReworkCostCents += fullCost
      continue
    }

    const target = acc.get(ticket.rootCausePhase as PhaseType)
    if (target) {
      const weighted = Math.round((fullCost * ticket.weight) / 10000)
      const weightedMinutes = Math.round((entry.minutes * ticket.weight) / 10000)
      target.reworkAttributedMinutes += weightedMinutes
      target.reworkAttributedCostCents += weighted
    }
  }

  return {
    byPhase: PHASE_TYPES.map((p) => acc.get(p)!),
    spentCents,
    reworkCostCents,
    clientReworkCostCents,
  }
}

/**
 * Validates that the weights of all rework tickets attached to a given
 * iteration sum to 10000 (basis points). Empty arrays return ok.
 */
export function validateReworkWeights(
  ticketsForIteration: ReadonlyArray<ReworkTicketInput>,
): { ok: true } | { ok: false; sum: number } {
  if (ticketsForIteration.length === 0) return { ok: true }
  const sum = ticketsForIteration.reduce((s, t) => s + t.weight, 0)
  return sum === 10000 ? { ok: true } : { ok: false, sum }
}
