import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { agentRuns } from '../../packages/db/src/schema'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedAgentDefinitions, seedMinimal } from '../helpers/test-seed'

describe('agents router', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  it('GET /api/agents on a DB with no agents returns []', async () => {
    const res = await apiFetch(ctx.app, '/api/agents')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('GET /api/agents lists the 6 agents with parsed tools and allowedPaths', async () => {
    await seedAgentDefinitions(ctx.db)
    const res = await apiFetch(ctx.app, '/api/agents')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{
      name: string
      watchesColumn: string
      requiresHumanSignoff: boolean
      tools: unknown[]
      allowedPaths: string[]
    }>
    expect(body).toHaveLength(6)
    const names = body.map((a) => a.name).sort()
    expect(names).toEqual(
      [
        'delivery-validator',
        'design-architect',
        'qa-reviewer',
        'sales-rep',
        'security-reviewer',
        'senior-dev',
      ].sort(),
    )
    const security = body.find((a) => a.name === 'security-reviewer')!
    expect(security.requiresHumanSignoff).toBe(true)
    expect(security.watchesColumn).toBe('qa_ready')
    expect(Array.isArray(security.tools)).toBe(true)
    expect(Array.isArray(security.allowedPaths)).toBe(true)
  })

  it('GET /api/agents/:name returns one', async () => {
    await seedAgentDefinitions(ctx.db)
    const res = await apiFetch(ctx.app, '/api/agents/senior-dev')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string; watchesColumn: string }
    expect(body.name).toBe('senior-dev')
    expect(body.watchesColumn).toBe('design_ready')
  })

  it('GET /api/agents/:name 404 when it does not exist', async () => {
    await seedAgentDefinitions(ctx.db)
    const res = await apiFetch(ctx.app, '/api/agents/nope')
    expect(res.status).toBe(404)
  })

  it('GET /api/agents/runs filters by agent name', async () => {
    await seedAgentDefinitions(ctx.db)
    const s = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })

    // Insert 2 runs: one for senior-dev, one for qa-reviewer
    await ctx.db.insert(agentRuns).values({
      id: 'run-001',
      taskId: s.taskIds[0]!,
      agentName: 'senior-dev',
      status: 'success',
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_010_000,
      artifactsJson: '[]',
    })
    await ctx.db.insert(agentRuns).values({
      id: 'run-002',
      taskId: s.taskIds[0]!,
      agentName: 'qa-reviewer',
      status: 'running',
      startedAt: 1_700_000_020_000,
      artifactsJson: '[]',
    })

    const res = await apiFetch(ctx.app, '/api/agents/runs?agent=senior-dev')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ id: string; agentName: string }>
    expect(body).toHaveLength(1)
    expect(body[0]!.agentName).toBe('senior-dev')
  })

  it('GET /api/agents/runs with no filter lists up to 100 recent', async () => {
    await seedAgentDefinitions(ctx.db)
    const res = await apiFetch(ctx.app, '/api/agents/runs')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})
