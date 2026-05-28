/**
 * Coverage for the /api/agent-runs router.
 *
 * What is NOT covered here (requires a real Claude CLI spawn or runner mocks —
 * see a future sub-phase): POST /start, POST /:id/cancel, GET /:id/stream.
 * The list, detail and auto-mode toggle endpoints are tested.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { agentRuns } from '../../packages/db/src/schema'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedAgentDefinitions, seedMinimal } from '../helpers/test-seed'

describe('agent-runs router', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  async function seedRun(id: string, taskId: string, agent: string, status = 'success') {
    await ctx.db.insert(agentRuns).values({
      id,
      taskId,
      agentName: agent,
      status: status as never,
      startedAt: 1_700_000_000_000,
      finishedAt: status === 'running' ? null : 1_700_000_010_000,
      artifactsJson: '[]',
    })
  }

  it('GET /api/agent-runs on an empty DB returns []', async () => {
    const res = await apiFetch(ctx.app, '/api/agent-runs')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('GET /api/agent-runs lists recent runs (most recent first)', async () => {
    await seedAgentDefinitions(ctx.db)
    const s = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 2 })
    await seedRun('run-A', s.taskIds[0]!, 'senior-dev', 'success')
    await ctx.db.insert(agentRuns).values({
      id: 'run-B',
      taskId: s.taskIds[1]!,
      agentName: 'qa-reviewer',
      status: 'running',
      startedAt: 1_700_000_050_000,
      artifactsJson: '[]',
    })

    const res = await apiFetch(ctx.app, '/api/agent-runs')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ id: string; startedAt: number }>
    expect(body).toHaveLength(2)
    expect(body[0]!.id).toBe('run-B') // most recent first
  })

  it('GET /api/agent-runs?task=ID filters by task', async () => {
    await seedAgentDefinitions(ctx.db)
    const s = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 2 })
    await seedRun('run-A', s.taskIds[0]!, 'senior-dev')
    await seedRun('run-B', s.taskIds[1]!, 'senior-dev')

    const res = await apiFetch(ctx.app, `/api/agent-runs?task=${s.taskIds[0]}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ taskId: string }>
    expect(body).toHaveLength(1)
    expect(body[0]!.taskId).toBe(s.taskIds[0])
  })

  it('GET /api/agent-runs/:id returns the run', async () => {
    await seedAgentDefinitions(ctx.db)
    const s = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
    await seedRun('run-X', s.taskIds[0]!, 'senior-dev')

    const res = await apiFetch(ctx.app, '/api/agent-runs/run-X')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; status: string }
    expect(body.id).toBe('run-X')
    expect(body.status).toBe('success')
  })

  it('GET /api/agent-runs/:id 404', async () => {
    const res = await apiFetch(ctx.app, '/api/agent-runs/nope')
    expect(res.status).toBe(404)
  })

  it('GET /api/agent-runs/auto-mode defaults to off', async () => {
    const res = await apiFetch(ctx.app, '/api/agent-runs/auto-mode')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { mode: string }
    expect(body.mode).toBe('off')
  })

  it('POST /api/agent-runs/auto-mode sets on/off (idempotent)', async () => {
    const on = await apiFetch(ctx.app, '/api/agent-runs/auto-mode', {
      method: 'POST',
      body: { mode: 'on' },
    })
    expect(on.status).toBe(200)
    expect(((await on.json()) as { mode: string }).mode).toBe('on')

    // Re-aplicar 'on' es idempotente
    const onAgain = await apiFetch(ctx.app, '/api/agent-runs/auto-mode', {
      method: 'POST',
      body: { mode: 'on' },
    })
    expect(onAgain.status).toBe(200)

    // Volver a off
    const off = await apiFetch(ctx.app, '/api/agent-runs/auto-mode', {
      method: 'POST',
      body: { mode: 'off' },
    })
    expect(off.status).toBe(200)
    expect(((await off.json()) as { mode: string }).mode).toBe('off')
  })

  it('POST /api/agent-runs/auto-mode 400 on an invalid mode', async () => {
    const res = await apiFetch(ctx.app, '/api/agent-runs/auto-mode', {
      method: 'POST',
      body: { mode: 'maybe' },
    })
    expect(res.status).toBe(400)
  })

  describe('GET /api/agent-runs/active', () => {
    it('returns [] when nothing is running', async () => {
      await seedAgentDefinitions(ctx.db)
      const s = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
      await seedRun('run-done', s.taskIds[0]!, 'senior-dev', 'success') // no running
      const res = await apiFetch(ctx.app, '/api/agent-runs/active')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('lists only the running ones, with taskCode/title and projectCode', async () => {
      await seedAgentDefinitions(ctx.db)
      const s = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 2 })
      await seedRun('run-old', s.taskIds[0]!, 'senior-dev', 'success')
      await ctx.db.insert(agentRuns).values({
        id: 'run-live',
        taskId: s.taskIds[1]!,
        agentName: 'qa-reviewer',
        status: 'running',
        column: 'dev_ready',
        startedAt: 1_700_000_050_000,
        artifactsJson: '[]',
      })
      const res = await apiFetch(ctx.app, '/api/agent-runs/active')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Array<{
        id: string
        agentName: string
        scope: string
        taskCode: string | null
        taskTitle: string | null
        projectCode: string | null
        column: string | null
      }>
      expect(body).toHaveLength(1)
      expect(body[0]!.id).toBe('run-live')
      expect(body[0]!.agentName).toBe('qa-reviewer')
      expect(body[0]!.scope).toBe('task')
      expect(body[0]!.taskCode).toBeTruthy()
      expect(body[0]!.taskTitle).toBeTruthy()
      expect(body[0]!.projectCode).toBe('TST1')
      expect(body[0]!.column).toBe('dev_ready')
    })

    it('labels scope=proposal for sales-rep runs without a task', async () => {
      await seedAgentDefinitions(ctx.db)
      await ctx.db.insert(agentRuns).values({
        id: 'run-salesrep',
        taskId: null,
        agentName: 'sales-rep',
        status: 'running',
        startedAt: 1_700_000_000_000,
        artifactsJson: JSON.stringify([{ kind: 'proposal-generation', proposalId: 'pr-1' }]),
      })
      const res = await apiFetch(ctx.app, '/api/agent-runs/active')
      const body = (await res.json()) as Array<{
        id: string
        scope: string
        taskCode: string | null
      }>
      expect(body).toHaveLength(1)
      expect(body[0]!.scope).toBe('proposal')
      expect(body[0]!.taskCode).toBeNull()
    })
  })

  describe('GET /api/agent-runs/log', () => {
    it('returns [] on an empty DB', async () => {
      const res = await apiFetch(ctx.app, '/api/agent-runs/log')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it('lists runs with model, tokens, cost and duration (most recent first)', async () => {
      await seedAgentDefinitions(ctx.db)
      const s = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
      await ctx.db.insert(agentRuns).values({
        id: 'run-old',
        taskId: s.taskIds[0]!,
        agentName: 'senior-dev',
        status: 'success',
        column: 'design_ready',
        model: 'claude-sonnet-4-6',
        startedAt: 1_700_000_000_000,
        finishedAt: 1_700_000_120_000,
        costTokens: 12_345,
        inputTokens: 10_000,
        outputTokens: 2_345,
        cacheReadTokens: 5_000,
        costUsdMicros: 234_500,
        artifactsJson: '[]',
      })
      await ctx.db.insert(agentRuns).values({
        id: 'run-new',
        taskId: s.taskIds[0]!,
        agentName: 'design-architect',
        status: 'running',
        column: 'backlog',
        model: 'claude-opus-4-7',
        startedAt: 1_700_000_500_000,
        artifactsJson: '[]',
      })
      const res = await apiFetch(ctx.app, '/api/agent-runs/log')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Array<{
        id: string
        model: string | null
        costTokens: number | null
        durationMs: number | null
        costUsdMicros: number | null
        projectCode: string | null
        taskCode: string | null
      }>
      expect(body).toHaveLength(2)
      expect(body[0]!.id).toBe('run-new') // newest first
      expect(body[0]!.model).toBe('claude-opus-4-7')
      expect(body[0]!.durationMs).toBeNull() // still running
      const old = body.find((r) => r.id === 'run-old')!
      expect(old.model).toBe('claude-sonnet-4-6')
      expect(old.costTokens).toBe(12_345)
      expect(old.durationMs).toBe(120_000)
      expect(old.costUsdMicros).toBe(234_500)
      expect(old.projectCode).toBe('TST1')
      expect(old.taskCode).toBeTruthy()
    })

    it('?limit=N bounds the result', async () => {
      await seedAgentDefinitions(ctx.db)
      const s = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert(agentRuns).values({
          id: `run-${i}`,
          taskId: s.taskIds[0]!,
          agentName: 'senior-dev',
          status: 'success',
          startedAt: 1_700_000_000_000 + i * 1000,
          artifactsJson: '[]',
        })
      }
      const res = await apiFetch(ctx.app, '/api/agent-runs/log?limit=2')
      const body = (await res.json()) as unknown[]
      expect(body).toHaveLength(2)
    })
  })
})
