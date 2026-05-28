/**
 * Phase state machine.
 *
 * Phase lifecycle (PHASES-WORKFLOW.md):
 *   pending ──start──▶ in_progress ──close──▶ approved
 *                          │             ──reject──▶ rejected
 *                          └──rework_requested──▶ rework ──restart──▶ in_progress (iter+1)
 *
 * Pure function. No IO, no clock — callers pass `now` if a timestamp is
 * needed.
 */

import type { PhaseStatus, PhaseType, Role } from '../values'
import { PHASE_OWNER_ROLE } from '../values'
import { type Result, err, ok } from './result'

export interface PhaseSnapshot {
  type: PhaseType
  status: PhaseStatus
  iteration: number
  ownerRole: Role
  startedAt: number | null
  closedAt: number | null
}

export type PhaseEvent =
  | { kind: 'start'; at: number }
  | { kind: 'approve'; at: number }
  | { kind: 'reject'; at: number; reason: string }
  | { kind: 'request_rework'; at: number; reason: string }
  | { kind: 'restart'; at: number }

export function applyPhaseEvent(snapshot: PhaseSnapshot, event: PhaseEvent): Result<PhaseSnapshot> {
  switch (event.kind) {
    case 'start':
      if (snapshot.status !== 'pending') {
        return err(
          'invalid_status_transition',
          `phase can only start from 'pending'; current status is '${snapshot.status}'`,
        )
      }
      return ok({ ...snapshot, status: 'in_progress', startedAt: event.at })

    case 'approve':
      if (snapshot.status !== 'in_progress') {
        return err(
          'invalid_status_transition',
          `phase can only be approved from 'in_progress'; current status is '${snapshot.status}'`,
        )
      }
      return ok({ ...snapshot, status: 'approved', closedAt: event.at })

    case 'reject':
      if (snapshot.status !== 'in_progress') {
        return err(
          'invalid_status_transition',
          `phase can only be rejected from 'in_progress'; current status is '${snapshot.status}'`,
        )
      }
      return ok({ ...snapshot, status: 'rejected', closedAt: event.at })

    case 'request_rework':
      if (snapshot.status !== 'in_progress' && snapshot.status !== 'approved') {
        return err(
          'invalid_status_transition',
          `phase can only enter rework from 'in_progress' or 'approved'; current status is '${snapshot.status}'`,
        )
      }
      return ok({ ...snapshot, status: 'rework', closedAt: null })

    case 'restart':
      if (snapshot.status !== 'rework') {
        return err(
          'invalid_status_transition',
          `phase can only restart from 'rework'; current status is '${snapshot.status}'`,
        )
      }
      return ok({
        ...snapshot,
        status: 'in_progress',
        iteration: snapshot.iteration + 1,
        closedAt: null,
      })
  }
}

export function initialPhase(type: PhaseType): PhaseSnapshot {
  return {
    type,
    status: 'pending',
    iteration: 1,
    ownerRole: PHASE_OWNER_ROLE[type],
    startedAt: null,
    closedAt: null,
  }
}

/** Phase types ordered by their position in the workflow. */
export const PHASE_ORDER: ReadonlyArray<PhaseType> = [
  'F1_SALES',
  'F2_KICKOFF',
  'F3_DESIGN',
  'F4_ARCHITECTURE',
  'F5_BUILD',
  'F6_QA_DEPLOY',
  'F7_HANDOFF',
]

/** The phase that should open next after `closed` closes, or null at F7. */
export function nextPhaseType(closed: PhaseType): PhaseType | null {
  const idx = PHASE_ORDER.indexOf(closed)
  if (idx < 0 || idx === PHASE_ORDER.length - 1) return null
  return PHASE_ORDER[idx + 1]!
}
