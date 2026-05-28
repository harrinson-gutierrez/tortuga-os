import { eq } from 'drizzle-orm'
// Task history (`GET /api/tasks/:id/timeline`) and the final validation queue
// (`GET /api/tasks/pending-validation`). The timeline merges agent_runs +
// kanban_movements chronologically. We can't spawn Claude in CI, so we insert
// runs/movements directly and assert the endpoint maps them (column, reasoning,
// summary, structured artifacts).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { agentRuns, kanbanMovements, tasks } from '../../packages/db/src/schema'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedAgentDefinitions, seedMinimal } from '../helpers/test-seed'

describe('task timeline + pending-validation', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })
  afterEach(() => {
    resetDbForTests()
  })

  it('GET /api/tasks/:id/timeline merges runs and movements chronologically', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
    await seedAgentDefinitions(ctx.db)
    const taskId = seeded.taskIds[0]!
    const t0 = 1_700_000_000_000

    ctx.db
      .insert(kanbanMovements)
      .values({
        id: 'mv-1',
        taskId,
        fromColumn: 'backlog',
        toColumn: 'design_ready',
        movedBy: 'design-architect',
        reason: 'plan ready',
        signedByHuman: false,
        at: t0 + 1000,
      })
      .run()
    // design-architect run (in backlog) — structured artifacts
    ctx.db
      .insert(agentRuns)
      .values({
        id: 'run-1',
        taskId,
        agentName: 'design-architect',
        status: 'success',
        column: 'backlog',
        startedAt: t0,
        finishedAt: t0 + 800,
        log: 'raw log',
        reasoning: 'Reasoned the technical plan',
        summary: 'approve — plan complete',
        artifactsJson: JSON.stringify([
          { path: '02-diseno/T-001-plan.md', action: 'created', sizeBytes: 1200 },
        ]),
      })
      .run()
    // senior-dev run (in design_ready) — legacy string artifacts
    ctx.db
      .insert(agentRuns)
      .values({
        id: 'run-2',
        taskId,
        agentName: 'senior-dev',
        status: 'running',
        column: 'design_ready',
        startedAt: t0 + 2000,
        log: '',
        artifactsJson: JSON.stringify(['04-repos/app/src/index.ts']),
      })
      .run()

    const res = await apiFetch(ctx.app, `/api/tasks/${taskId}/timeline`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<
      | {
          kind: 'run'
          at: number
          run: {
            id: string
            column: string | null
            artifacts: Array<{ path: string; action: string }>
            summary: string | null
            reasoning: string | null
          }
        }
      | { kind: 'movement'; at: number; movement: { fromColumn: string; toColumn: string } }
    >
    expect(body).toHaveLength(3)
    expect(body.map((e) => e.at)).toEqual([t0, t0 + 1000, t0 + 2000])
    const e0 = body[0]!
    expect(e0.kind).toBe('run')
    if (e0.kind === 'run') {
      expect(e0.run.id).toBe('run-1')
      expect(e0.run.column).toBe('backlog')
      expect(e0.run.summary).toBe('approve — plan complete')
      expect(e0.run.reasoning).toBe('Reasoned the technical plan')
      expect(e0.run.artifacts).toEqual([
        { path: '02-diseno/T-001-plan.md', action: 'created', sizeBytes: 1200, kind: null },
      ])
    }
    expect(body[1]!.kind).toBe('movement')
    // run-2: legacy string artifact mapped to {path, action:'created'}
    const e2 = body[2]!
    if (e2.kind === 'run') {
      expect(e2.run.artifacts[0]!.path).toBe('04-repos/app/src/index.ts')
      expect(e2.run.artifacts[0]!.action).toBe('created')
    }
  })

  it('empty timeline when there is no activity', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
    const res = await apiFetch(ctx.app, `/api/tasks/${seeded.taskIds[0]}/timeline`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('GET /api/tasks/pending-validation lists only tasks in delivery_ready', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 2 })
    ctx.db
      .update(tasks)
      .set({ status: 'delivery_ready', updatedAt: Date.now() })
      .where(eq(tasks.id, seeded.taskIds[0]!))
      .run()

    const all = await apiFetch(ctx.app, '/api/tasks/pending-validation')
    expect(all.status).toBe(200)
    const allBody = (await all.json()) as Array<{ id: string; status: string }>
    expect(allBody).toHaveLength(1)
    expect(allBody[0]!.id).toBe(seeded.taskIds[0]!)
    expect(allBody[0]!.status).toBe('delivery_ready')

    const byProj = await apiFetch(ctx.app, '/api/tasks/pending-validation?project=TST1')
    const byProjBody = (await byProj.json()) as Array<{ id: string }>
    expect(byProjBody).toHaveLength(1)

    const nope = await apiFetch(ctx.app, '/api/tasks/pending-validation?project=NOPE')
    expect(nope.status).toBe(404)
  })
})
