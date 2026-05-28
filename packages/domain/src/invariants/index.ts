/**
 * Cross-cutting invariants (DOMAIN.md §3).
 *
 * Functions that take a snapshot of related entities and return a list of
 * violations. Empty list = healthy. Callers (core) run these before
 * committing transactions and reject the operation when any violation
 * surfaces.
 */

import { PHASE_ORDER } from '../state-machines/phase'
import type { PhaseType } from '../values'

export interface InvariantViolation {
  code: InvariantCode
  message: string
}

export type InvariantCode =
  | 'duplicate_phase_type'
  | 'phase_predecessor_not_approved'
  | 'task_approved_without_evidence'
  | 'iteration_rework_without_ticket'
  | 'rework_weights_unbalanced'
  | 'quote_approved_twice'
  | 'story_acceptance_criteria_missing'

export interface PhaseRow {
  type: PhaseType
  status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'rework'
}

/**
 * Invariant 1: a project has exactly 0 or 1 Phase per type.
 */
export function checkSinglePhasePerType(phases: ReadonlyArray<PhaseRow>): InvariantViolation[] {
  const seen = new Set<PhaseType>()
  const out: InvariantViolation[] = []
  for (const p of phases) {
    if (seen.has(p.type)) {
      out.push({
        code: 'duplicate_phase_type',
        message: `Duplicate phase type '${p.type}'`,
      })
    }
    seen.add(p.type)
  }
  return out
}

/**
 * Invariant 2: a Phase cannot transition to 'approved' until its predecessor
 * (by F-number) is 'approved'. F5 and F6 may run in pipeline per task, but
 * F4 must be approved before any F5 work.
 */
export function checkPredecessorApprovedBeforeStart(
  phases: ReadonlyArray<PhaseRow>,
  targetType: PhaseType,
): InvariantViolation[] {
  const idx = PHASE_ORDER.indexOf(targetType)
  if (idx <= 0) return []
  const predType = PHASE_ORDER[idx - 1]!
  const pred = phases.find((p) => p.type === predType)
  if (!pred || pred.status !== 'approved') {
    return [
      {
        code: 'phase_predecessor_not_approved',
        message: `Cannot start ${targetType}: predecessor ${predType} is ${pred?.status ?? 'missing'}`,
      },
    ]
  }
  return []
}

export interface QuoteRow {
  version: number
  status: 'draft' | 'sent' | 'changes_requested' | 'approved' | 'rejected'
}

/**
 * Invariant 6: a Quote can only be `approved` once per phase. Multiple
 * approved rows on the same F1 phase is a bug.
 */
export function checkSingleApprovedQuote(quotes: ReadonlyArray<QuoteRow>): InvariantViolation[] {
  const approved = quotes.filter((q) => q.status === 'approved')
  if (approved.length > 1) {
    return [
      {
        code: 'quote_approved_twice',
        message: `Multiple approved quote versions: ${approved.map((q) => q.version).join(', ')}`,
      },
    ]
  }
  return []
}

export interface TaskRow {
  status: 'pending' | 'in_progress' | 'qa' | 'approved' | 'rejected' | 'rework'
  evidenceCount: number
}

/**
 * Invariant 3: every Task in `approved` state has at least one Evidence
 * row attached.
 */
export function checkApprovedTaskHasEvidence(task: TaskRow): InvariantViolation[] {
  if (task.status === 'approved' && task.evidenceCount === 0) {
    return [
      {
        code: 'task_approved_without_evidence',
        message: 'Task is approved but no evidence is attached',
      },
    ]
  }
  return []
}

export interface IterationRow {
  outcome: 'approved' | 'rejected' | 'rework_requested' | null
  reworkTicketCount: number
}

/**
 * Invariant 4: every Iteration closed with outcome=rework_requested has
 * at least one ReworkTicket.
 */
export function checkReworkIterationHasTicket(iter: IterationRow): InvariantViolation[] {
  if (iter.outcome === 'rework_requested' && iter.reworkTicketCount === 0) {
    return [
      {
        code: 'iteration_rework_without_ticket',
        message: 'Iteration closed with rework_requested but no rework ticket exists',
      },
    ]
  }
  return []
}
