/**
 * Task state machine.
 *
 * Task lifecycle (DOMAIN.md §Task):
 *   pending ──start──▶ in_progress ──submit_qa──▶ qa ──approve──▶ approved
 *                                                       └──reject──▶ rework
 *                       ▲                                              │
 *                       └──── restart (iter+1) ◀───────────────────────┘
 *
 * Reject closes the current iteration with outcome=rework_requested and
 * opens iteration n+1 in `core`. The state machine here only flips the
 * task's status field; the iteration row is appended by the caller.
 */

import type { Role, TaskStatus, TaskType } from '../values'
import { type Result, err, ok } from './result'

export interface TaskSnapshot {
  type: TaskType
  ownerRole: Role
  status: TaskStatus
  currentIteration: number
  estimatedHoursMin: number
  actualHoursMin: number
}

export type TaskEvent =
  | { kind: 'start' }
  | { kind: 'submit_qa' }
  | { kind: 'approve' }
  | { kind: 'reject' }
  | { kind: 'restart' }
  | { kind: 'reopen' }

export function applyTaskEvent(snapshot: TaskSnapshot, event: TaskEvent): Result<TaskSnapshot> {
  switch (event.kind) {
    case 'start':
      if (snapshot.status !== 'pending') {
        return err(
          'invalid_status_transition',
          `task can only start from 'pending'; current status is '${snapshot.status}'`,
        )
      }
      return ok({ ...snapshot, status: 'in_progress' })

    case 'submit_qa':
      if (snapshot.status !== 'in_progress' && snapshot.status !== 'rework') {
        return err(
          'invalid_status_transition',
          `task can only move to qa from 'in_progress' or 'rework'; current status is '${snapshot.status}'`,
        )
      }
      return ok({ ...snapshot, status: 'qa' })

    case 'approve':
      if (
        snapshot.status !== 'qa' &&
        snapshot.status !== 'in_progress' &&
        snapshot.status !== 'rework'
      ) {
        return err(
          'invalid_status_transition',
          `task can only be approved from 'qa', 'in_progress' or 'rework'; current status is '${snapshot.status}'`,
        )
      }
      return ok({ ...snapshot, status: 'approved' })

    case 'reject':
      if (
        snapshot.status !== 'qa' &&
        snapshot.status !== 'in_progress' &&
        snapshot.status !== 'rework'
      ) {
        return err(
          'invalid_status_transition',
          `task can only be rejected from 'qa', 'in_progress' or 'rework'; current status is '${snapshot.status}'`,
        )
      }
      return ok({
        ...snapshot,
        status: 'rework',
        currentIteration: snapshot.currentIteration + 1,
      })

    case 'restart':
      if (snapshot.status !== 'rework') {
        return err(
          'invalid_status_transition',
          `task can only restart from 'rework'; current status is '${snapshot.status}'`,
        )
      }
      return ok({ ...snapshot, status: 'in_progress' })

    case 'reopen':
      if (snapshot.status !== 'approved' && snapshot.status !== 'rejected') {
        return err(
          'invalid_status_transition',
          `task can only reopen from 'approved' or 'rejected'; current status is '${snapshot.status}'`,
        )
      }
      return ok({
        ...snapshot,
        status: 'in_progress',
        currentIteration: snapshot.currentIteration + 1,
      })
  }
}

export function initialTask(type: TaskType, ownerRole: Role, estimatedHoursMin = 0): TaskSnapshot {
  return {
    type,
    ownerRole,
    status: 'pending',
    currentIteration: 1,
    estimatedHoursMin,
    actualHoursMin: 0,
  }
}
