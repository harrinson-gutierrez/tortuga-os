import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('sprints router', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  it('GET /api/sprints lists all active sprints', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, sprints: 3 })
    const res = await apiFetch(ctx.app, '/api/sprints')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ num: number }>
    expect(body).toHaveLength(3)
  })

  it('GET /api/sprints?project=TST1 filters by project code', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 2, sprints: 2 })
    // 2 projects × 2 sprints = 4 total; filter down to the 2 from the first project
    const res = await apiFetch(ctx.app, '/api/sprints?project=TST1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ projectId: string }>
    expect(body).toHaveLength(2)
    expect(body[0]!.projectId).toBe('p-001')
  })

  it('GET /api/sprints?project=NOPE 404 when the project does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/sprints?project=NOPE')
    expect(res.status).toBe(404)
  })

  it('GET /api/sprints/:id returns the sprint', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, sprints: 1 })
    const res = await apiFetch(ctx.app, '/api/sprints/s-p-001-001')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; num: number }
    expect(body.num).toBe(1)
  })

  it('GET /api/sprints/:id 404 when it does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/sprints/nope')
    expect(res.status).toBe(404)
  })

  it('POST /api/sprints happy-path 201', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const res = await apiFetch(ctx.app, '/api/sprints', {
      method: 'POST',
      body: {
        projectId: seeded.projectIds[0],
        num: 1,
        goal: 'Setup',
        startDate: 1_700_000_000_000,
        endDate: 1_700_500_000_000,
      },
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { num: number; status: string }
    expect(body.num).toBe(1)
    expect(body.status).toBe('planned')
  })

  it('POST /api/sprints 400 when num is not positive', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const res = await apiFetch(ctx.app, '/api/sprints', {
      method: 'POST',
      body: {
        projectId: seeded.projectIds[0],
        num: 0,
        startDate: 1_700_000_000_000,
        endDate: 1_700_500_000_000,
      },
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/sprints/:id/status active closes the previously active sprint', async () => {
    // seedMinimal pone sprint #1 active y #2 planned
    await seedMinimal(ctx.db, { clients: 1, projects: 1, sprints: 2 })
    const res = await apiFetch(ctx.app, '/api/sprints/s-p-001-002/status', {
      method: 'POST',
      body: { status: 'active' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; status: string }
    expect(body.status).toBe('active')

    // Sprint #1, which was active, must now be closed
    const prev = await apiFetch(ctx.app, '/api/sprints/s-p-001-001')
    const prevBody = (await prev.json()) as { status: string }
    expect(prevBody.status).toBe('closed')
  })

  it('PATCH /api/sprints/:id updates the goal', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, sprints: 1 })
    const res = await apiFetch(ctx.app, '/api/sprints/s-p-001-001', {
      method: 'PATCH',
      body: { goal: 'Updated goal' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { goal: string }
    expect(body.goal).toBe('Updated goal')
  })

  it('DELETE /api/sprints/:id soft-deletes and unlinks tasks (sprintId → null)', async () => {
    const seeded = await seedMinimal(ctx.db, {
      clients: 1,
      projects: 1,
      sprints: 1,
      tasks: 2,
    })
    const sprintId = seeded.sprintIds[0]!
    const { attachTasksToSprint } = await import('../helpers/test-seed')
    await attachTasksToSprint(ctx.db, seeded.taskIds, sprintId)

    const del = await apiFetch(ctx.app, `/api/sprints/${sprintId}`, { method: 'DELETE' })
    expect(del.status).toBe(204)

    // Sprint is out of the list
    const list = await apiFetch(ctx.app, '/api/sprints')
    expect(await list.json()).toEqual([])

    // The tasks must still be alive with sprintId = null
    const tasksList = await apiFetch(ctx.app, '/api/tasks')
    const tasksBody = (await tasksList.json()) as Array<{ sprintId: string | null }>
    expect(tasksBody).toHaveLength(2)
    expect(tasksBody.every((t) => t.sprintId === null)).toBe(true)
  })

  it('DELETE /api/sprints/:id 404 on a non-existent id', async () => {
    const res = await apiFetch(ctx.app, '/api/sprints/nope', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
