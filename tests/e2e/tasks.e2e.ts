import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { agentRuns, tasks } from '../../packages/db/src/schema'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedAgentDefinitions, seedMinimal } from '../helpers/test-seed'

describe('tasks router', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  it('GET /api/tasks lists all active tasks', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 3 })
    const res = await apiFetch(ctx.app, '/api/tasks')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ id: string }>
    expect(body).toHaveLength(3)
  })

  it('GET /api/tasks?project=TST1 filters by project', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 2, tasks: 2 })
    const res = await apiFetch(ctx.app, '/api/tasks?project=TST1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ projectId: string }>
    expect(body).toHaveLength(2)
    expect(body[0]!.projectId).toBe('p-001')
  })

  it('GET /api/tasks?project=NOPE 404', async () => {
    const res = await apiFetch(ctx.app, '/api/tasks?project=NOPE')
    expect(res.status).toBe(404)
  })

  it('GET /api/tasks/:id returns the task', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
    const res = await apiFetch(ctx.app, '/api/tasks/t-p-001-001')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { code: string; status: string }
    expect(body.status).toBe('backlog')
  })

  it('GET /api/tasks/:id 404', async () => {
    const res = await apiFetch(ctx.app, '/api/tasks/nope')
    expect(res.status).toBe(404)
  })

  it('POST /api/tasks creates with status backlog and tags', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const res = await apiFetch(ctx.app, '/api/tasks', {
      method: 'POST',
      body: {
        projectId: seeded.projectIds[0],
        code: 'T-100',
        title: 'New Task',
        description: 'Body',
        priority: 'high',
        tags: ['backend', 'aws'],
        estimateMinutes: 120,
        needsDesign: true,
      },
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      status: string
      tags: string[]
      priority: string
      needsDesign: boolean
    }
    expect(body.status).toBe('backlog')
    expect(body.tags).toEqual(['backend', 'aws'])
    expect(body.priority).toBe('high')
    expect(body.needsDesign).toBe(true)
  })

  it('POST /api/tasks 400 on empty title', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const res = await apiFetch(ctx.app, '/api/tasks', {
      method: 'POST',
      body: { projectId: seeded.projectIds[0], code: 'T-X', title: '' },
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/tasks 400 when estimateMinutes is not positive', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const res = await apiFetch(ctx.app, '/api/tasks', {
      method: 'POST',
      body: {
        projectId: seeded.projectIds[0],
        code: 'T-X',
        title: 'X',
        estimateMinutes: 0,
      },
    })
    expect(res.status).toBe(400)
  })

  it('PATCH /api/tasks/:id updates title, priority and tags', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
    const res = await apiFetch(ctx.app, '/api/tasks/t-p-001-001', {
      method: 'PATCH',
      body: { title: 'Renamed', priority: 'high', tags: ['critical'] },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      title: string
      priority: string
      tags: string[]
    }
    expect(body.title).toBe('Renamed')
    expect(body.priority).toBe('high')
    expect(body.tags).toEqual(['critical'])
  })

  it('PATCH /api/tasks/:id 400 on an unknown field (strict)', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
    const res = await apiFetch(ctx.app, '/api/tasks/t-p-001-001', {
      method: 'PATCH',
      body: { unknown: 'x' },
    })
    expect(res.status).toBe(400)
  })

  it('PATCH /api/tasks/:id 404', async () => {
    const res = await apiFetch(ctx.app, '/api/tasks/nope', {
      method: 'PATCH',
      body: { title: 'X' },
    })
    expect(res.status).toBe(404)
  })

  it('DELETE /api/tasks/:id soft-deletes', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 2 })
    const del = await apiFetch(ctx.app, '/api/tasks/t-p-001-001', { method: 'DELETE' })
    expect(del.status).toBe(204)

    const list = await apiFetch(ctx.app, '/api/tasks')
    const remaining = (await list.json()) as Array<{ id: string }>
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.id).toBe('t-p-001-002')
  })

  it('DELETE /api/tasks/:id 404', async () => {
    const res = await apiFetch(ctx.app, '/api/tasks/nope', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  describe('agent clarification (needs_input)', () => {
    const TASK_ID = 't-p-001-001'

    async function seedPendingQuestion(question = 'Do we use Stripe or another provider?') {
      await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
      await seedAgentDefinitions(ctx.db)
      const runId = 'run-clarify-1'
      await ctx.db.insert(agentRuns).values({
        id: runId,
        taskId: TASK_ID,
        agentName: 'senior-dev',
        status: 'success',
        column: 'design_ready',
        startedAt: 1_700_000_000_000,
        finishedAt: 1_700_000_500_000,
        reviewJson: JSON.stringify({ verdict: 'needs_input', question, artifacts: [] }),
      })
      await ctx.db.update(tasks).set({ awaitingInputRunId: runId }).where(eq(tasks.id, TASK_ID))
      return runId
    }

    it('GET /api/tasks/:id/clarification returns null when there is no question', async () => {
      await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
      const res = await apiFetch(ctx.app, `/api/tasks/${TASK_ID}/clarification`)
      expect(res.status).toBe(200)
      expect(await res.json()).toBeNull()
    })

    it('GET /api/tasks/:id/clarification returns the pending question', async () => {
      const runId = await seedPendingQuestion()
      const res = await apiFetch(ctx.app, `/api/tasks/${TASK_ID}/clarification`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { runId: string; agentName: string; question: string }
      expect(body.runId).toBe(runId)
      expect(body.agentName).toBe('senior-dev')
      expect(body.question).toContain('Stripe')
    })

    it('POST /api/tasks/:id/answer-clarification clears the flag', async () => {
      const runId = await seedPendingQuestion()
      const res = await apiFetch(ctx.app, `/api/tasks/${TASK_ID}/answer-clarification`, {
        method: 'POST',
        body: { runId, answer: 'Usamos Stripe.' },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        task: { awaitingInputRunId: string | null }
        createdTask: unknown
      }
      expect(body.task.awaitingInputRunId).toBeNull()
      expect(body.createdTask).toBeNull()

      const after = await apiFetch(ctx.app, `/api/tasks/${TASK_ID}/clarification`)
      expect(await after.json()).toBeNull()
    })

    it('POST /api/tasks/:id/answer-clarification can create a linked task', async () => {
      const runId = await seedPendingQuestion()
      const res = await apiFetch(ctx.app, `/api/tasks/${TASK_ID}/answer-clarification`, {
        method: 'POST',
        body: {
          runId,
          answer: 'We need to migrate the gateway first.',
          alsoCreateTask: { title: 'Migrar pasarela de pago', description: 'Spin-off' },
        },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        createdTask: { id: string; title: string; status: string; tags: string[] } | null
      }
      expect(body.createdTask).not.toBeNull()
      expect(body.createdTask!.title).toBe('Migrar pasarela de pago')
      expect(body.createdTask!.status).toBe('backlog')
      expect(body.createdTask!.tags).toContain('from-clarification')
    })

    it('POST /api/tasks/:id/answer-clarification 400 when runId does not match', async () => {
      await seedPendingQuestion()
      const res = await apiFetch(ctx.app, `/api/tasks/${TASK_ID}/answer-clarification`, {
        method: 'POST',
        body: { runId: 'run-wrong', answer: 'x' },
      })
      expect(res.status).toBe(400)
    })

    it('POST /api/tasks/:id/answer-clarification 400 on empty answer', async () => {
      const runId = await seedPendingQuestion()
      const res = await apiFetch(ctx.app, `/api/tasks/${TASK_ID}/answer-clarification`, {
        method: 'POST',
        body: { runId, answer: '' },
      })
      expect(res.status).toBe(400)
    })
  })
})
