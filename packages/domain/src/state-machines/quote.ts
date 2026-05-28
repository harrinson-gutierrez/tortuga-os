/**
 * Quote state machine.
 *
 * Quote lifecycle (PHASES-WORKFLOW.md §F1):
 *   draft ──send──▶ sent ──approve──▶ approved
 *                       ──request_changes──▶ changes_requested (spawns v+1 draft)
 *                       ──reject──▶ rejected
 *
 * Approval is final — an approved quote can never be patched. New scope
 * after approval means a new quote version, not a mutation.
 */

import type { QuoteStatus } from '../values'
import { type Result, err, ok } from './result'

export interface QuoteSnapshot {
  version: number
  status: QuoteStatus
  totalHoursMin: number
  totalCostCents: number
  discountBps: number
  approvedAt: number | null
}

export type QuoteEvent =
  | {
      kind: 'patch'
      totalHoursMin?: number
      totalCostCents?: number
      discountBps?: number
    }
  | { kind: 'send' }
  | { kind: 'approve'; at: number }
  | { kind: 'reject' }
  | { kind: 'request_changes' }

export function applyQuoteEvent(snapshot: QuoteSnapshot, event: QuoteEvent): Result<QuoteSnapshot> {
  switch (event.kind) {
    case 'patch':
      if (snapshot.status !== 'draft' && snapshot.status !== 'sent') {
        return err(
          'invalid_status_transition',
          `quote can only be patched while draft or sent; current status is '${snapshot.status}'`,
        )
      }
      return ok({
        ...snapshot,
        totalHoursMin: event.totalHoursMin ?? snapshot.totalHoursMin,
        totalCostCents: event.totalCostCents ?? snapshot.totalCostCents,
        discountBps: event.discountBps ?? snapshot.discountBps,
      })

    case 'send':
      if (snapshot.status !== 'draft') {
        return err(
          'invalid_status_transition',
          `quote can only be sent from 'draft'; current status is '${snapshot.status}'`,
        )
      }
      return ok({ ...snapshot, status: 'sent' })

    case 'approve':
      if (snapshot.status !== 'sent') {
        return err(
          'invalid_status_transition',
          `quote can only be approved from 'sent'; current status is '${snapshot.status}'`,
        )
      }
      return ok({ ...snapshot, status: 'approved', approvedAt: event.at })

    case 'reject':
      if (snapshot.status !== 'sent') {
        return err(
          'invalid_status_transition',
          `quote can only be rejected from 'sent'; current status is '${snapshot.status}'`,
        )
      }
      return ok({ ...snapshot, status: 'rejected' })

    case 'request_changes':
      if (snapshot.status !== 'sent') {
        return err(
          'invalid_status_transition',
          `quote can only be marked changes_requested from 'sent'; current status is '${snapshot.status}'`,
        )
      }
      return ok({ ...snapshot, status: 'changes_requested' })
  }
}

/** Build the next quote draft (version+1) seeded from a changes_requested one. */
export function nextDraftFrom(previous: QuoteSnapshot): QuoteSnapshot {
  return {
    version: previous.version + 1,
    status: 'draft',
    totalHoursMin: previous.totalHoursMin,
    totalCostCents: previous.totalCostCents,
    discountBps: previous.discountBps,
    approvedAt: null,
  }
}

export function initialQuote(): QuoteSnapshot {
  return {
    version: 1,
    status: 'draft',
    totalHoursMin: 0,
    totalCostCents: 0,
    discountBps: 0,
    approvedAt: null,
  }
}
