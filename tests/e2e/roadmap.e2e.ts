import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { taskSteps, tasks as tasksTable } from '../../packages/db/src/schema'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('project roadmap', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  it('GET /api/projects/:code/roadmap returns projectId, projectCode, and tasks array', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 2 })

    const res = await apiFetch(ctx.app, '/api/projects/TST1/roadmap')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      projectId: string
      projectCode: string
      tasks: Array<{ id: string; steps: unknown[] }>
    }
    expect(body.projectCode).toBe('TST1')
    expect(body.projectId).toMatch(/^p-/)
    expect(body.tasks).toHaveLength(2)
  })

  it('GET /api/projects/:code/roadmap 404 when project does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/projects/NOPE/roadmap')
    expect(res.status).toBe(404)
  })

  it('roadmap tasks include seq and reviewedAt fields', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
    await ctx.db.update(tasksTable).set({ seq: 1 }).where(eq(tasksTable.projectId, 'p-001'))

    const res = await apiFetch(ctx.app, '/api/projects/TST1/roadmap')
    const body = (await res.json()) as {
      tasks: Array<{ seq: number | null; reviewedAt: number | null }>
    }
    expect(body.tasks[0]!.seq).toBe(1)
    expect(body.tasks[0]!.reviewedAt).toBeNull()
  })

  it('roadmap tasks include their pipeline steps ordered by idx', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
    const taskId = 't-p-001-001'
    await ctx.db.insert(taskSteps).values([
      { id: 's-001', taskId, idx: 0, stepKey: 'architect-review', status: 'done' },
      { id: 's-002', taskId, idx: 1, stepKey: 'implement', status: 'pending' },
    ])

    const res = await apiFetch(ctx.app, '/api/projects/TST1/roadmap')
    const body = (await res.json()) as {
      tasks: Array<{ steps: Array<{ idx: number; stepKey: string; status: string }> }>
    }
    const steps = body.tasks[0]!.steps
    expect(steps).toHaveLength(2)
    expect(steps[0]!.idx).toBe(0)
    expect(steps[0]!.stepKey).toBe('architect-review')
    expect(steps[0]!.status).toBe('done')
    expect(steps[1]!.stepKey).toBe('implement')
    expect(steps[1]!.status).toBe('pending')
  })

  it('roadmap returns empty steps array for tasks with no steps', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
    const res = await apiFetch(ctx.app, '/api/projects/TST1/roadmap')
    const body = (await res.json()) as { tasks: Array<{ steps: unknown[] }> }
    expect(body.tasks[0]!.steps).toEqual([])
  })

  it('roadmap tasks ordered by seq asc, then by createdAt asc', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 2 })
    await ctx.db.update(tasksTable).set({ seq: 2 }).where(eq(tasksTable.id, 't-p-001-001'))
    await ctx.db.update(tasksTable).set({ seq: 1 }).where(eq(tasksTable.id, 't-p-001-002'))

    const res = await apiFetch(ctx.app, '/api/projects/TST1/roadmap')
    const body = (await res.json()) as { tasks: Array<{ id: string; seq: number }> }
    expect(body.tasks[0]!.seq).toBe(1)
    expect(body.tasks[1]!.seq).toBe(2)
  })
})
