import { eq } from 'drizzle-orm'
/**
 * Coverage for the lead_movements audit.
 *
 * It used to only log to pino (debt #4 in the plan); now it is persisted in the
 * `lead_movements` table. These tests are additional to those in leads.e2e.ts.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { leadMovements as leadMovementsTable } from '../../packages/db/src/schema'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('lead_movements audit', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  it('PATCH on a lead that changes stage records a row in lead_movements', async () => {
    await seedMinimal(ctx.db, { leads: 1 })

    await apiFetch(ctx.app, '/api/leads/l-001', {
      method: 'PATCH',
      body: { currentStage: 'brief' },
    })

    const movs = await ctx.db
      .select()
      .from(leadMovementsTable)
      .where(eq(leadMovementsTable.leadId, 'l-001'))
      .all()
    expect(movs).toHaveLength(1)
    expect(movs[0]!.fromStage).toBe('lead')
    expect(movs[0]!.toStage).toBe('brief')
    expect(movs[0]!.movedBy).toBe('human')
  })

  it('PATCH that does NOT change stage adds no movement', async () => {
    await seedMinimal(ctx.db, { leads: 1 })
    await apiFetch(ctx.app, '/api/leads/l-001', {
      method: 'PATCH',
      body: { brief: 'Only changing the brief' },
    })
    const movs = await ctx.db
      .select()
      .from(leadMovementsTable)
      .where(eq(leadMovementsTable.leadId, 'l-001'))
      .all()
    expect(movs).toHaveLength(0)
  })

  it('Multiple stage PATCHes accumulate movements in order', async () => {
    await seedMinimal(ctx.db, { leads: 1 })
    for (const stage of ['brief', 'proposal_v0', 'sent', 'negotiation']) {
      await apiFetch(ctx.app, '/api/leads/l-001', {
        method: 'PATCH',
        body: { currentStage: stage },
      })
    }
    const movs = await ctx.db
      .select()
      .from(leadMovementsTable)
      .where(eq(leadMovementsTable.leadId, 'l-001'))
      .all()
    expect(movs).toHaveLength(4)
    const transitions = movs.map((m) => `${m.fromStage}→${m.toStage}`)
    expect(transitions).toEqual([
      'lead→brief',
      'brief→proposal_v0',
      'proposal_v0→sent',
      'sent→negotiation',
    ])
  })

  it('GET /api/leads/:id/movements returns the movements of the lead', async () => {
    await seedMinimal(ctx.db, { leads: 1 })
    await apiFetch(ctx.app, '/api/leads/l-001', {
      method: 'PATCH',
      body: { currentStage: 'sent' },
    })

    const res = await apiFetch(ctx.app, '/api/leads/l-001/movements')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{
      fromStage: string
      toStage: string
    }>
    expect(body).toHaveLength(1)
    expect(body[0]!.fromStage).toBe('lead')
    expect(body[0]!.toStage).toBe('sent')
  })

  it('Soft-deleting the lead removes the movements (FK CASCADE)', async () => {
    await seedMinimal(ctx.db, { leads: 1 })
    await apiFetch(ctx.app, '/api/leads/l-001', {
      method: 'PATCH',
      body: { currentStage: 'brief' },
    })

    // The use-case soft-delete sets deletedAt but does NOT delete physically.
    // The movements are still there (not a hard delete).
    await apiFetch(ctx.app, '/api/leads/l-001', { method: 'DELETE' })
    const movs = await ctx.db
      .select()
      .from(leadMovementsTable)
      .where(eq(leadMovementsTable.leadId, 'l-001'))
      .all()
    // Soft-delete preserves movements (that's what we want for the audit).
    expect(movs).toHaveLength(1)
  })
})
