import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('people router', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  it('GET /api/people returns the active people', async () => {
    await seedMinimal(ctx.db, { people: 3 })
    const res = await apiFetch(ctx.app, '/api/people')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ id: string }>
    expect(body).toHaveLength(3)
  })

  it('GET /api/people on an empty DB returns []', async () => {
    const res = await apiFetch(ctx.app, '/api/people')
    expect(await res.json()).toEqual([])
  })

  it('GET /api/people/:id returns the person', async () => {
    await seedMinimal(ctx.db, { people: 1 })
    const res = await apiFetch(ctx.app, '/api/people/pe-001')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; name: string }
    expect(body.id).toBe('pe-001')
  })

  it('GET /api/people/:id 404 when it does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/people/nope')
    expect(res.status).toBe(404)
  })

  it('POST /api/people happy-path 201', async () => {
    const res = await apiFetch(ctx.app, '/api/people', {
      method: 'POST',
      body: {
        name: 'New Dev',
        email: 'new@dev.local',
        role: 'Senior backend',
        type: 'partner',
        defaultCostRateCents: 7500,
      },
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; type: string }
    expect(body.type).toBe('partner')
    expect(body.id).toBeTruthy()
  })

  it('POST /api/people 400 on empty role', async () => {
    const res = await apiFetch(ctx.app, '/api/people', {
      method: 'POST',
      body: { name: 'X', role: '' },
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/people 400 on an invalid type', async () => {
    const res = await apiFetch(ctx.app, '/api/people', {
      method: 'POST',
      body: { name: 'X', role: 'Y', type: 'contractor' },
    })
    expect(res.status).toBe(400)
  })

  it('PATCH /api/people/:id updates role and costRate', async () => {
    await seedMinimal(ctx.db, { people: 1 })
    const res = await apiFetch(ctx.app, '/api/people/pe-001', {
      method: 'PATCH',
      body: { role: 'Lead backend', defaultCostRateCents: 9000 },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { role: string; defaultCostRateCents: number }
    expect(body.role).toBe('Lead backend')
    expect(body.defaultCostRateCents).toBe(9000)
  })

  it('PATCH /api/people/:id 404 when it does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/people/nope', {
      method: 'PATCH',
      body: { role: 'Y' },
    })
    expect(res.status).toBe(404)
  })

  it('DELETE /api/people/:id soft-deletes', async () => {
    await seedMinimal(ctx.db, { people: 2 })
    const del = await apiFetch(ctx.app, '/api/people/pe-001', { method: 'DELETE' })
    expect(del.status).toBe(204)

    const list = await apiFetch(ctx.app, '/api/people')
    const remaining = (await list.json()) as Array<{ id: string }>
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.id).toBe('pe-002')
  })

  it('DELETE /api/people/:id 404 on a non-existent id', async () => {
    const res = await apiFetch(ctx.app, '/api/people/nope', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
