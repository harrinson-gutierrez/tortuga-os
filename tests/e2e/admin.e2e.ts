import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAutoMode } from '../../apps/sidecar/src/modules/agent-runs/watcher'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedAgentDefinitions, seedMinimal } from '../helpers/test-seed'

describe('admin router', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  it('POST /api/admin/wipe deletes operational data (clients/projects/tasks/...)', async () => {
    await seedMinimal(ctx.db, {
      clients: 1,
      projects: 1,
      people: 1,
      tasks: 2,
      sprints: 1,
      milestones: 2,
      leads: 2,
    })

    const before = await apiFetch(ctx.app, '/api/clients')
    expect((await before.json()) as unknown[]).toHaveLength(1)

    const wipe = await apiFetch(ctx.app, '/api/admin/wipe', { method: 'POST' })
    expect(wipe.status).toBe(200)
    const body = (await wipe.json()) as { ok: boolean; wiped: boolean }
    expect(body.ok).toBe(true)
    expect(body.wiped).toBe(true)

    const clients = await apiFetch(ctx.app, '/api/clients')
    expect(await clients.json()).toEqual([])
    const projects = await apiFetch(ctx.app, '/api/projects')
    expect(await projects.json()).toEqual([])
    const tasks = await apiFetch(ctx.app, '/api/tasks')
    expect(await tasks.json()).toEqual([])
    const milestones = await apiFetch(ctx.app, '/api/milestones')
    expect(await milestones.json()).toEqual([])
    const leads = await apiFetch(ctx.app, '/api/leads')
    expect(await leads.json()).toEqual([])
  })

  it('POST /api/admin/wipe preserves agent_definitions', async () => {
    await seedAgentDefinitions(ctx.db)
    await seedMinimal(ctx.db, { clients: 1 })

    await apiFetch(ctx.app, '/api/admin/wipe', { method: 'POST' })

    const agents = await apiFetch(ctx.app, '/api/agents')
    const body = (await agents.json()) as Array<{ name: string }>
    expect(body).toHaveLength(6)
  })

  it('POST /api/admin/wipe preserves app_settings (auto_mode)', async () => {
    await setAutoMode('on')
    await seedMinimal(ctx.db, { clients: 1 })

    await apiFetch(ctx.app, '/api/admin/wipe', { method: 'POST' })

    const am = await apiFetch(ctx.app, '/api/agent-runs/auto-mode')
    const body = (await am.json()) as { mode: string }
    expect(body.mode).toBe('on')
  })

  it('POST /api/admin/wipe on an empty DB is idempotent', async () => {
    const wipe = await apiFetch(ctx.app, '/api/admin/wipe', { method: 'POST' })
    expect(wipe.status).toBe(200)
  })
})
