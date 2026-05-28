// Onboarding setup endpoints — the wizard the user goes through on first run.
// We cover the status persistence (complete / reset) end-to-end and that
// runSetupCheck returns a well-shaped result for any step regardless of
// whether the underlying binary exists on the host that runs the tests.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'

describe('/api/setup', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    ctx.db.$client.close()
  })

  it('GET /status returns completed=false on a fresh DB', async () => {
    const res = await apiFetch(ctx.app, '/api/setup/status')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { completed: boolean; completedAt: number | null }
    expect(body.completed).toBe(false)
    expect(body.completedAt).toBeNull()
  })

  it('POST /complete persists and is idempotent', async () => {
    const first = await apiFetch(ctx.app, '/api/setup/complete', { method: 'POST' })
    expect(first.status).toBe(200)
    const a = (await first.json()) as { completed: boolean; completedAt: number | null }
    expect(a.completed).toBe(true)
    expect(typeof a.completedAt).toBe('number')

    const status = await apiFetch(ctx.app, '/api/setup/status')
    const sBody = (await status.json()) as { completed: boolean }
    expect(sBody.completed).toBe(true)

    // Calling complete again is allowed — it refreshes the timestamp without
    // failing or duplicating the row.
    const second = await apiFetch(ctx.app, '/api/setup/complete', { method: 'POST' })
    expect(second.status).toBe(200)
    const b = (await second.json()) as { completed: boolean; completedAt: number | null }
    expect(b.completed).toBe(true)
    expect(b.completedAt).toBeGreaterThanOrEqual(a.completedAt ?? 0)
  })

  it('POST /reset clears the completed flag', async () => {
    await apiFetch(ctx.app, '/api/setup/complete', { method: 'POST' })
    const reset = await apiFetch(ctx.app, '/api/setup/reset', { method: 'POST' })
    expect(reset.status).toBe(200)
    const r = (await reset.json()) as { completed: boolean; completedAt: number | null }
    expect(r.completed).toBe(false)
    expect(r.completedAt).toBeNull()

    const status = await apiFetch(ctx.app, '/api/setup/status')
    const sBody = (await status.json()) as { completed: boolean }
    expect(sBody.completed).toBe(false)
  })

  it('POST /check-step rejects an unknown step with 400', async () => {
    const res = await apiFetch(ctx.app, '/api/setup/check-step', {
      method: 'POST',
      body: { step: 'nonsense' },
    })
    expect(res.status).toBe(400)
  })

  it('POST /check-step rejects a missing step with 400', async () => {
    const res = await apiFetch(ctx.app, '/api/setup/check-step', {
      method: 'POST',
      body: {},
    })
    expect(res.status).toBe(400)
  })

  it('POST /check-step claude-cli returns a well-shaped result (ok depends on host)', async () => {
    const res = await apiFetch(ctx.app, '/api/setup/check-step', {
      method: 'POST',
      body: { step: 'claude-cli' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      step: string
      ok: boolean
      message: string
      fix?: string
      durationMs: number
    }
    expect(body.step).toBe('claude-cli')
    expect(typeof body.ok).toBe('boolean')
    expect(typeof body.message).toBe('string')
    expect(typeof body.durationMs).toBe('number')
    if (!body.ok) expect(body.fix).toBeTruthy()
  }, 30_000)
})
