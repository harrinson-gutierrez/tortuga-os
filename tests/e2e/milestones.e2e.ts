import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('milestones router', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  it('GET /api/milestones lists all active milestones', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, milestones: 3 })
    const res = await apiFetch(ctx.app, '/api/milestones')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ num: number }>
    expect(body).toHaveLength(3)
  })

  it('GET /api/milestones?project=TST1 filters by project', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 2, milestones: 2 })
    const res = await apiFetch(ctx.app, '/api/milestones?project=TST1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ projectId: string }>
    expect(body).toHaveLength(2)
    expect(body[0]!.projectId).toBe('p-001')
  })

  it('GET /api/milestones?project=NOPE 404 when the project does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/milestones?project=NOPE')
    expect(res.status).toBe(404)
  })

  it('GET /api/milestones/:id returns the milestone', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, milestones: 1 })
    const res = await apiFetch(ctx.app, '/api/milestones/m-p-001-001')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { num: number; status: string }
    expect(body.status).toBe('pending')
  })

  it('GET /api/milestones/:id 404 when it does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/milestones/nope')
    expect(res.status).toBe(404)
  })

  it('PATCH /api/milestones/:id updates label and dueDate', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, milestones: 1 })
    const res = await apiFetch(ctx.app, '/api/milestones/m-p-001-001', {
      method: 'PATCH',
      body: { label: 'Renombrado', dueDate: 1_701_000_000_000 },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { label: string; dueDate: number }
    expect(body.label).toBe('Renombrado')
    expect(body.dueDate).toBe(1_701_000_000_000)
  })

  it('PATCH /api/milestones/:id markAsPaid setea status=paid + paidAt + paidAmountCents', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, milestones: 1 })
    const before = Date.now()
    const res = await apiFetch(ctx.app, '/api/milestones/m-p-001-001', {
      method: 'PATCH',
      body: { markAsPaid: true },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      status: string
      paidAt: number
      paidAmountCents: number
    }
    expect(body.status).toBe('paid')
    expect(body.paidAt).toBeGreaterThanOrEqual(before)
    expect(body.paidAmountCents).toBe(50_000) // amountCents from the seed
  })

  it('PATCH /api/milestones/:id 400 on an unknown field (strict)', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, milestones: 1 })
    const res = await apiFetch(ctx.app, '/api/milestones/m-p-001-001', {
      method: 'PATCH',
      body: { unknownField: 'x' },
    })
    expect(res.status).toBe(400)
  })

  it('PATCH /api/milestones/:id 404 when it does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/milestones/nope', {
      method: 'PATCH',
      body: { label: 'X' },
    })
    expect(res.status).toBe(404)
  })

  it('DELETE /api/milestones/:id soft-deletes', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, milestones: 2 })
    const del = await apiFetch(ctx.app, '/api/milestones/m-p-001-001', { method: 'DELETE' })
    expect(del.status).toBe(204)

    const list = await apiFetch(ctx.app, '/api/milestones')
    const remaining = (await list.json()) as Array<{ id: string }>
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.id).toBe('m-p-001-002')
  })

  it('DELETE /api/milestones/:id 404 on a non-existent id', async () => {
    const res = await apiFetch(ctx.app, '/api/milestones/nope', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
