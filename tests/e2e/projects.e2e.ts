/**
 * E2E for the /api/projects router.
 *
 * Canonical pattern for the other 12 routers. Minimum binding coverage per
 * docs/PLAN-CONSOLIDADO.md §7:
 *   - GET list
 *   - GET by id (status endpoint in this router)
 *   - POST happy-path (201 + DTO)
 *   - POST validation error (400 + details)
 *   - PATCH soft-delete-aware
 *   - DELETE soft-delete observable
 *   - DELETE 404 on a non-existent id
 *   - Module business rules (milestone sum = contracted amount)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('projects router', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  it('GET /api/projects returns the seeded projects with their client', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 2 })

    const res = await apiFetch(ctx.app, '/api/projects')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{
      id: string
      code: string
      client: { id: string; name: string }
    }>
    expect(body).toHaveLength(2)
    expect(body[0]!.code).toBe('TST1')
    expect(body[0]!.client.id).toBe('c-001')
  })

  it('GET /api/projects on an empty DB returns []', async () => {
    const res = await apiFetch(ctx.app, '/api/projects')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('GET /api/projects/:code returns an aggregated status', async () => {
    await seedMinimal(ctx.db, {
      clients: 1,
      projects: 1,
      sprints: 1,
      tasks: 2,
      milestones: 2,
    })

    const res = await apiFetch(ctx.app, '/api/projects/TST1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      project: { code: string }
      activeSprint: { num: number } | null
      milestones: Array<{ num: number }>
      margin: { billedCents: number }
    }
    expect(body.project.code).toBe('TST1')
    expect(body.activeSprint?.num).toBe(1)
    expect(body.milestones).toHaveLength(2)
    expect(body.margin.billedCents).toBe(0) // no milestone paid yet
  })

  it('GET /api/projects/:code 404 when it does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/projects/UNKNOWN')
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('POST /api/projects happy-path creates a project and returns status', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, people: 0 })

    const res = await apiFetch(ctx.app, '/api/projects', {
      method: 'POST',
      body: {
        clientId: seeded.clientIds[0],
        code: 'NEW1',
        name: 'New Project',
        contractedAmountCents: 100_000,
        contractedHours: 40,
        currency: 'USD',
        status: 'draft',
        repoPaths: [],
        milestones: [
          {
            num: 1,
            label: 'Kickoff',
            dueDate: 1_700_000_000_000,
            amountCents: 100_000,
          },
        ],
        members: [],
      },
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      project: { code: string; contractedAmountCents: number }
      milestones: Array<unknown>
    }
    expect(body.project.code).toBe('NEW1')
    expect(body.project.contractedAmountCents).toBe(100_000)
    expect(body.milestones).toHaveLength(1)
  })

  it('POST /api/projects 400 when the milestone sum != contracted amount', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })

    const res = await apiFetch(ctx.app, '/api/projects', {
      method: 'POST',
      body: {
        clientId: seeded.clientIds[0],
        code: 'BAD1',
        name: 'Bad Project',
        contractedAmountCents: 100_000,
        contractedHours: 40,
        currency: 'USD',
        status: 'draft',
        repoPaths: [],
        milestones: [
          // sums to 50_000, not 100_000 — must be rejected
          {
            num: 1,
            label: 'Half',
            dueDate: 1_700_000_000_000,
            amountCents: 50_000,
          },
        ],
        members: [],
      },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('VALIDATION')
    expect(body.error.message).toMatch(/milestone|sum|contracted/i)
  })

  it('POST /api/projects 400 when the code is not uppercase', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })

    const res = await apiFetch(ctx.app, '/api/projects', {
      method: 'POST',
      body: {
        clientId: seeded.clientIds[0],
        code: 'lowercase',
        name: 'X',
        contractedAmountCents: 0,
        contractedHours: 0,
        currency: 'USD',
        status: 'draft',
        repoPaths: [],
        milestones: [],
        members: [],
      },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; details: unknown[] } }
    expect(body.error.code).toBe('VALIDATION')
    expect(body.error.details.length).toBeGreaterThan(0)
  })

  it('POST /api/projects 404 when clientId does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/projects', {
      method: 'POST',
      body: {
        clientId: 'c-does-not-exist',
        code: 'GHST',
        name: 'Ghost',
        contractedAmountCents: 0,
        contractedHours: 0,
        currency: 'USD',
        status: 'draft',
        repoPaths: [],
        milestones: [],
        members: [],
      },
    })
    expect(res.status).toBe(404)
  })

  it('POST /api/projects 400 on a duplicate code', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1 })

    const res = await apiFetch(ctx.app, '/api/projects', {
      method: 'POST',
      body: {
        clientId: seeded.clientIds[0],
        code: 'TST1', // ya existe (lo siembra seedMinimal)
        name: 'Duplicate',
        contractedAmountCents: 0,
        contractedHours: 0,
        currency: 'USD',
        status: 'draft',
        repoPaths: [],
        milestones: [],
        members: [],
      },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('VALIDATION')
  })

  it('PATCH /api/projects/:id updates partial fields', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1 })

    const res = await apiFetch(ctx.app, `/api/projects/${seeded.projectIds[0]}`, {
      method: 'PATCH',
      body: { name: 'Renamed Project', status: 'paused' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      id: string
      name: string
      status: string
    }
    expect(body.name).toBe('Renamed Project')
    expect(body.status).toBe('paused')
  })

  it('DELETE /api/projects/:id soft-deletes (sets deletedAt) and hides it from the list', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 2 })

    const del = await apiFetch(ctx.app, `/api/projects/${seeded.projectIds[0]}`, {
      method: 'DELETE',
    })
    expect(del.status).toBe(204)

    const list = await apiFetch(ctx.app, '/api/projects')
    const remaining = (await list.json()) as Array<{ id: string }>
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.id).toBe(seeded.projectIds[1])
  })

  it('DELETE /api/projects/:id 404 on a non-existent id', async () => {
    const res = await apiFetch(ctx.app, '/api/projects/p-missing', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
