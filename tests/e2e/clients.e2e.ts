import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('clients router', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  it('GET /api/clients returns the active clients', async () => {
    await seedMinimal(ctx.db, { clients: 2 })
    const res = await apiFetch(ctx.app, '/api/clients')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ id: string; name: string }>
    expect(body).toHaveLength(2)
    expect(body[0]!.id).toBe('c-001')
  })

  it('GET /api/clients on an empty DB returns []', async () => {
    const res = await apiFetch(ctx.app, '/api/clients')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('GET /api/clients/:id returns the client', async () => {
    await seedMinimal(ctx.db, { clients: 1 })
    const res = await apiFetch(ctx.app, '/api/clients/c-001')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; name: string }
    expect(body.id).toBe('c-001')
  })

  it('GET /api/clients/:id 404 when it does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/clients/nope')
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('POST /api/clients happy-path creates a client and returns 201', async () => {
    const res = await apiFetch(ctx.app, '/api/clients', {
      method: 'POST',
      body: { name: 'New Client', taxId: 'NIT-999', contactEmail: 'new@test.local' },
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; name: string }
    expect(body.name).toBe('New Client')
    expect(body.id).toBeTruthy()
  })

  it('POST /api/clients 400 on empty name', async () => {
    const res = await apiFetch(ctx.app, '/api/clients', {
      method: 'POST',
      body: { name: '' },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; details: unknown[] } }
    expect(body.error.code).toBe('VALIDATION')
    expect(body.error.details.length).toBeGreaterThan(0)
  })

  it('POST /api/clients 400 on an invalid email', async () => {
    const res = await apiFetch(ctx.app, '/api/clients', {
      method: 'POST',
      body: { name: 'X', contactEmail: 'not-an-email' },
    })
    expect(res.status).toBe(400)
  })

  it('PATCH /api/clients/:id updates partial fields', async () => {
    await seedMinimal(ctx.db, { clients: 1 })
    const res = await apiFetch(ctx.app, '/api/clients/c-001', {
      method: 'PATCH',
      body: { name: 'Renamed' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string }
    expect(body.name).toBe('Renamed')
  })

  it('PATCH /api/clients/:id 404 when it does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/clients/nope', {
      method: 'PATCH',
      body: { name: 'X' },
    })
    expect(res.status).toBe(404)
  })

  it('DELETE /api/clients/:id soft-deletes (no live projects)', async () => {
    await seedMinimal(ctx.db, { clients: 1 })
    const del = await apiFetch(ctx.app, '/api/clients/c-001', { method: 'DELETE' })
    expect(del.status).toBe(204)

    const list = await apiFetch(ctx.app, '/api/clients')
    expect(await list.json()).toEqual([])
  })

  it('DELETE /api/clients/:id 409 when it has live projects', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const del = await apiFetch(ctx.app, '/api/clients/c-001', { method: 'DELETE' })
    expect(del.status).toBe(409)
    const body = (await del.json()) as { error: { code: string } }
    expect(body.error.code).toBe('client_has_active_projects')
  })

  it('DELETE /api/clients/:id 404 on a non-existent id', async () => {
    const res = await apiFetch(ctx.app, '/api/clients/nope', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
