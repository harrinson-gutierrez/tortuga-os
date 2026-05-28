/**
 * Iteration state machine.
 *
 * An iteration is an "attempt" at closing a task. It opens when its task
 * moves to `in_progress` (n=1) or `rework` (n+1), and closes with one of:
 *   - approved          (the task is done)
 *   - rejected          (terminal failure; the task is abandoned)
 *   - rework_requested  (defects found; the task gets a new iteration)
 */

import type { IterationOutcome, Role } from '../values'
import { type Result, err, ok } from './result'

export interface IterationSnapshot {
  n: number
  startedAt: number
  closedAt: number | null
  outcome: IterationOutcome | null
  closedByRole: Role | null
  notes: string | null
}

export type IterationEvent = {
  kind: 'close'
  at: number
  outcome: IterationOutcome
  closedByRole: Role
  notes?: string
}

export function applyIterationEvent(
  snapshot: IterationSnapshot,
  event: IterationEvent,
): Result<IterationSnapshot> {
  if (event.kind !== 'close') {
    return err('unknown_event', `iteration only accepts 'close'`)
  }
  if (snapshot.closedAt !== null) {
    return err('invalid_status_transition', `iteration ${snapshot.n} is already closed`)
  }
  return ok({
    ...snapshot,
    closedAt: event.at,
    outcome: event.outcome,
    closedByRole: event.closedByRole,
    notes: event.notes ?? null,
  })
}

export function newIteration(n: number, at: number): IterationSnapshot {
  return {
    n,
    startedAt: at,
    closedAt: null,
    outcome: null,
    closedByRole: null,
    notes: null,
  }
}
