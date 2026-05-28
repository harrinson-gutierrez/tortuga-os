/**
 * Flow: full progression of a lead through its 7 stages.
 *   lead → brief → proposal_v0 → sent → negotiation → signed → instantiated.
 *
 * In F3.2 (the quoter) the change to `instantiated` will be atomic alongside the
 * project creation via `instantiate_project`. For now each transition is a
 * manual PATCH.
 *
 * We validate:
 *   - the full pipeline can be traversed
 *   - any stage is persisted and retrievable
 *   - a bounce to a previous stage is legal (PATCH does not enforce direction —
 *     F3.1.9 will document transition rules and add lead_movements)
 *   - deleted leads do not appear in lists and soft-delete blocks getLead
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

const STAGES = [
  'lead',
  'brief',
  'proposal_v0',
  'sent',
  'negotiation',
  'signed',
  'instantiated',
] as const

describe('flow: lead stage progression', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  async function setStage(leadId: string, stage: string) {
    const res = await apiFetch(ctx.app, `/api/leads/${leadId}`, {
      method: 'PATCH',
      body: { currentStage: stage },
    })
    expect(res.status).toBe(200)
    return (await res.json()) as { currentStage: string }
  }

  it('advances a lead through the 7 stages in order', async () => {
    await seedMinimal(ctx.db, { leads: 1 })

    // Etapa inicial
    const initial = (await (await apiFetch(ctx.app, '/api/leads/l-001')).json()) as {
      currentStage: string
    }
    expect(initial.currentStage).toBe('lead')

    // Avanzar paso a paso
    for (const stage of STAGES.slice(1)) {
      const result = await setStage('l-001', stage)
      expect(result.currentStage).toBe(stage)
    }

    // Verificar etapa final
    const final = (await (await apiFetch(ctx.app, '/api/leads/l-001')).json()) as {
      currentStage: string
    }
    expect(final.currentStage).toBe('instantiated')
  })

  it('allows a bounce to an earlier stage (negotiation → brief)', async () => {
    await seedMinimal(ctx.db, { leads: 1 })

    await setStage('l-001', 'brief')
    await setStage('l-001', 'proposal_v0')
    await setStage('l-001', 'sent')
    await setStage('l-001', 'negotiation')

    // Rebote
    const back = await setStage('l-001', 'brief')
    expect(back.currentStage).toBe('brief')
  })

  it('rejects a stage not listed in the enum', async () => {
    await seedMinimal(ctx.db, { leads: 1 })
    const res = await apiFetch(ctx.app, '/api/leads/l-001', {
      method: 'PATCH',
      body: { currentStage: 'cancelled' }, // no existe
    })
    expect(res.status).toBe(400)
  })

  it('soft-delete hides the lead from lists and PATCH cannot find it', async () => {
    await seedMinimal(ctx.db, { leads: 2 })

    const del = await apiFetch(ctx.app, '/api/leads/l-001', { method: 'DELETE' })
    expect(del.status).toBe(204)

    const list = (await (await apiFetch(ctx.app, '/api/leads')).json()) as Array<{
      id: string
    }>
    expect(list).toHaveLength(1)
    expect(list[0]!.id).toBe('l-002')

    const patchRes = await apiFetch(ctx.app, '/api/leads/l-001', {
      method: 'PATCH',
      body: { currentStage: 'sent' },
    })
    expect(patchRes.status).toBe(404)
  })

  it('multiple leads advance independently', async () => {
    await seedMinimal(ctx.db, { leads: 3 })

    await setStage('l-001', 'brief')
    await setStage('l-002', 'sent')
    await setStage('l-003', 'signed')

    const list = (await (await apiFetch(ctx.app, '/api/leads')).json()) as Array<{
      id: string
      currentStage: string
    }>
    const byId = Object.fromEntries(list.map((l) => [l.id, l.currentStage]))
    expect(byId['l-001']).toBe('brief')
    expect(byId['l-002']).toBe('sent')
    expect(byId['l-003']).toBe('signed')
  })

  it('updatedAt changes on every PATCH', async () => {
    await seedMinimal(ctx.db, { leads: 1 })
    const before = (await (await apiFetch(ctx.app, '/api/leads/l-001')).json()) as {
      updatedAt: number
    }

    await new Promise((r) => setTimeout(r, 5))
    await setStage('l-001', 'brief')

    const after = (await (await apiFetch(ctx.app, '/api/leads/l-001')).json()) as {
      updatedAt: number
    }
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt)
  })
})
