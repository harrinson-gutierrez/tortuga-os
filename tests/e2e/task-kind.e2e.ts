import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('task kind — API', () => {
  let ctx: TestApp
  beforeEach(() => {
    ctx = buildTestApp()
  })
  afterEach(() => {
    resetDbForTests()
  })

  it('createTask defaults kind to feature; accepts discovery', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const projectId = seeded.projectIds[0]!

    const r1 = await apiFetch(ctx.app, '/api/tasks', {
      method: 'POST',
      body: { projectId, code: 'T-100', title: 'A feature' },
    })
    expect(r1.status).toBe(201)
    expect(((await r1.json()) as { kind: string }).kind).toBe('feature')

    const r2 = await apiFetch(ctx.app, '/api/tasks', {
      method: 'POST',
      body: { projectId, code: 'T-101', title: 'Discovery', kind: 'discovery' },
    })
    expect(r2.status).toBe(201)
    expect(((await r2.json()) as { kind: string }).kind).toBe('discovery')
  })

  it('createTask creates DEFAULT_FEATURE_PIPELINE steps (6 steps) by default', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const created = await apiFetch(ctx.app, '/api/tasks', {
      method: 'POST',
      body: { projectId: seeded.projectIds[0]!, code: 'T-200', title: 'Feature task' },
    })
    const { id } = (await created.json()) as { id: string }

    const res = await apiFetch(ctx.app, `/api/tasks/${id}/steps`)
    expect(res.status).toBe(200)
    const steps = (await res.json()) as Array<{ idx: number; stepKey: string; status: string }>
    expect(steps).toHaveLength(6)
    expect(steps[0]!.stepKey).toBe('design-spec')
    expect(steps[0]!.status).toBe('pending')
    expect(steps[5]!.stepKey).toBe('deliver')
  })

  it('createTask with a custom pipeline creates exactly those steps', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const created = await apiFetch(ctx.app, '/api/tasks', {
      method: 'POST',
      body: {
        projectId: seeded.projectIds[0]!,
        code: 'T-300',
        title: 'Discovery',
        kind: 'discovery',
        pipeline: ['architect-review', 'write-design-doc', 'qa-doc-check'],
      },
    })
    const { id } = (await created.json()) as { id: string }

    const res = await apiFetch(ctx.app, `/api/tasks/${id}/steps`)
    const steps = (await res.json()) as Array<{ idx: number; stepKey: string }>
    expect(steps).toHaveLength(3)
    expect(steps.map((s) => s.stepKey)).toEqual([
      'architect-review',
      'write-design-doc',
      'qa-doc-check',
    ])
  })

  it('POST /api/tasks/:id/continue sets reviewedAt to unblock the watcher for the next task', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const created = await apiFetch(ctx.app, '/api/tasks', {
      method: 'POST',
      body: { projectId: seeded.projectIds[0]!, code: 'T-400', title: 'Task A' },
    })
    const { id, reviewedAt: before } = (await created.json()) as {
      id: string
      reviewedAt: number | null
    }
    expect(before).toBeNull()

    const res = await apiFetch(ctx.app, `/api/tasks/${id}/continue`, { method: 'POST' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { reviewedAt: number | null }
    expect(body.reviewedAt).toBeTypeOf('number')
  })

  it('POST /api/tasks/steps/:stepId/skip marks the step as skipped', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const created = await apiFetch(ctx.app, '/api/tasks', {
      method: 'POST',
      body: { projectId: seeded.projectIds[0]!, code: 'T-500', title: 'Skip test' },
    })
    const { id } = (await created.json()) as { id: string }
    const steps = (await (await apiFetch(ctx.app, `/api/tasks/${id}/steps`)).json()) as Array<{
      id: string
    }>
    const stepId = steps[0]!.id

    const res = await apiFetch(ctx.app, `/api/tasks/steps/${stepId}/skip`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { status: string }).status).toBe('skipped')
  })
})
