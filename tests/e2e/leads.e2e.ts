import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('leads router', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  it('GET /api/leads on an empty DB returns []', async () => {
    const res = await apiFetch(ctx.app, '/api/leads')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('GET /api/leads lists the active leads', async () => {
    await seedMinimal(ctx.db, { leads: 3 })
    const res = await apiFetch(ctx.app, '/api/leads')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ id: string }>
    expect(body).toHaveLength(3)
  })

  it('GET /api/leads/:id returns the lead', async () => {
    await seedMinimal(ctx.db, { leads: 1 })
    const res = await apiFetch(ctx.app, '/api/leads/l-001')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; currentStage: string }
    expect(body.id).toBe('l-001')
    expect(body.currentStage).toBe('lead')
  })

  it('GET /api/leads/:id 404', async () => {
    const res = await apiFetch(ctx.app, '/api/leads/nope')
    expect(res.status).toBe(404)
  })

  it('PATCH /api/leads/:id advances currentStage', async () => {
    await seedMinimal(ctx.db, { leads: 1 })
    const res = await apiFetch(ctx.app, '/api/leads/l-001', {
      method: 'PATCH',
      body: { currentStage: 'brief' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { currentStage: string }
    expect(body.currentStage).toBe('brief')
  })

  it('PATCH /api/leads/:id 400 on an invalid stage', async () => {
    await seedMinimal(ctx.db, { leads: 1 })
    const res = await apiFetch(ctx.app, '/api/leads/l-001', {
      method: 'PATCH',
      body: { currentStage: 'unknown_stage' },
    })
    expect(res.status).toBe(400)
  })

  it('PATCH /api/leads/:id 400 on an unknown field (strict)', async () => {
    await seedMinimal(ctx.db, { leads: 1 })
    const res = await apiFetch(ctx.app, '/api/leads/l-001', {
      method: 'PATCH',
      body: { foo: 'bar' },
    })
    expect(res.status).toBe(400)
  })

  it('PATCH /api/leads/:id updates brief and followup', async () => {
    await seedMinimal(ctx.db, { leads: 1 })
    const res = await apiFetch(ctx.app, '/api/leads/l-001', {
      method: 'PATCH',
      body: {
        brief: 'Plataforma SaaS multi-tenant',
        nextFollowupAt: 1_705_000_000_000,
      },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { brief: string; nextFollowupAt: number }
    expect(body.brief).toMatch(/SaaS/)
    expect(body.nextFollowupAt).toBe(1_705_000_000_000)
  })

  it('PATCH /api/leads/:id 404', async () => {
    const res = await apiFetch(ctx.app, '/api/leads/nope', {
      method: 'PATCH',
      body: { currentStage: 'brief' },
    })
    expect(res.status).toBe(404)
  })

  it('DELETE /api/leads/:id soft-deletes', async () => {
    await seedMinimal(ctx.db, { leads: 2 })
    const del = await apiFetch(ctx.app, '/api/leads/l-001', { method: 'DELETE' })
    expect(del.status).toBe(204)
    const list = await apiFetch(ctx.app, '/api/leads')
    const remaining = (await list.json()) as Array<{ id: string }>
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.id).toBe('l-002')
  })

  it('DELETE /api/leads/:id 404', async () => {
    const res = await apiFetch(ctx.app, '/api/leads/nope', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
